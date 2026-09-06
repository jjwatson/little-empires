import { useState } from 'react'
import { FACILITY_BY_ID, PLANET_TYPES, facilityCostOn, facilityIncomeOn } from '../data'
import { availableBuilds, planetIncome } from '../model'
import type { Empire, Planet, TurnActions } from '../model'
import { Res, ResourceInputs, fmt } from './common'

interface Props {
  empire: Empire
  actions: TurnActions
  onActions: (a: TurnActions) => void
  onChange: (e: Empire) => void
}

export function PlanetView({ empire, actions, onActions, onChange }: Props) {
  const [planetId, setPlanetId] = useState(empire.planets[0].id)
  const planet = empire.planets.find((p) => p.id === planetId) ?? empire.planets[0]
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')

  const queued = actions.builds.find((b) => b.planetId === planet.id)
  const options = availableBuilds(empire, planet).filter(
    (f) => !query || f.name.toLowerCase().includes(query.toLowerCase()),
  )

  function setBuild(facilityId: string | null) {
    const builds = actions.builds.filter((b) => b.planetId !== planet.id)
    if (facilityId) builds.push({ planetId: planet.id, facilityId })
    onActions({ ...actions, builds })
  }

  function updatePlanet(patch: Partial<Planet>) {
    onChange({ ...empire, planets: empire.planets.map((p) => (p.id === planet.id ? { ...p, ...patch } : p)) })
  }

  return (
    <section>
      <div className="card">
        <div className="tabs">
          {empire.planets.map((p) => (
            <button key={p.id} className={p.id === planet.id ? 'active' : ''} onClick={() => setPlanetId(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
        <h2>
          {planet.name} <span className="muted">· {PLANET_TYPES.find((t) => t.id === planet.type)?.name}</span>
        </h2>
        <p className="muted">{PLANET_TYPES.find((t) => t.id === planet.type)?.summary}</p>
        {editing ? (
          <PlanetEditor planet={planet} onSave={(patch) => { updatePlanet(patch); setEditing(false) }} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <p>
              Population {fmt(planet.population)} · Base income <Res r={planet.baseIncome} signedValues /> · Total income{' '}
              <Res r={planetIncome(planet)} signedValues /> <button onClick={() => setEditing(true)}>edit</button>
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h3>Facilities</h3>
        {planet.facilities.length === 0 && <p className="muted">Nothing built yet.</p>}
        <table className="advances">
          <tbody>
            {planet.facilities.map((o) => {
              const f = FACILITY_BY_ID.get(o.facilityId)
              if (!f) return null
              return (
                <tr key={o.facilityId}>
                  <td>
                    <strong>{f.name}</strong>
                    {o.count > 1 ? ` ×${o.count}` : ''}
                    {f.notes && <div className="muted small">{f.notes}</div>}
                  </td>
                  <td className="cost">
                    <Res r={facilityIncomeOn(planet.type, f)} signedValues /> each
                  </td>
                </tr>
              )
            })}
            {planet.inProgress && (
              <tr className="locked">
                <td>
                  Building {FACILITY_BY_ID.get(planet.inProgress.facilityId)?.name} — {planet.inProgress.turnsLeft} turn
                  {planet.inProgress.turnsLeft === 1 ? '' : 's'} left
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>
          Build this turn{' '}
          {queued && (
            <span className="muted">
              · queued: {FACILITY_BY_ID.get(queued.facilityId)?.name}{' '}
              <button onClick={() => setBuild(null)}>clear</button>
            </span>
          )}
        </h3>
        {planet.inProgress ? (
          <p className="muted">This planet's construction slot is busy until the current build finishes.</p>
        ) : (
          <>
            <input placeholder="Filter facilities…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {options.length === 0 && <p className="muted">No facilities available. Research unlocks them.</p>}
            <table className="advances">
              <tbody>
                {options.map((f) => {
                  const isQueued = queued?.facilityId === f.id
                  return (
                    <tr key={f.id} className={isQueued ? 'available' : ''}>
                      <td className="act">
                        <button className={isQueued ? 'primary' : ''} onClick={() => setBuild(isQueued ? null : f.id)}>
                          {isQueued ? 'Queued' : 'Queue'}
                        </button>
                      </td>
                      <td>
                        <strong>{f.name}</strong>
                        <div className="muted small">{f.effects}</div>
                        {f.notes && <div className="muted small">{f.notes}</div>}
                        {f.requires.note && <div className="muted small">Note: {f.requires.note}</div>}
                        {f.buildTime && f.buildTime > 1 && <div className="small">Build time: {f.buildTime} turns</div>}
                      </td>
                      <td className="cost">
                        <div>
                          Cost: <Res r={facilityCostOn(planet.type, f)} />
                        </div>
                        <div>
                          Monthly: <Res r={facilityIncomeOn(planet.type, f)} signedValues />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  )
}

function PlanetEditor({ planet, onSave, onCancel }: { planet: Planet; onSave: (p: Partial<Planet>) => void; onCancel: () => void }) {
  const [population, setPopulation] = useState(planet.population)
  const [baseIncome, setBaseIncome] = useState(planet.baseIncome)
  return (
    <form
      className="inner"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ population, baseIncome })
      }}
    >
      <label>
        Population
        <input type="number" value={population} onChange={(e) => setPopulation(Number(e.target.value))} />
      </label>
      <h4>Base income per turn</h4>
      <ResourceInputs value={baseIncome} onChange={setBaseIncome} />
      <div className="row">
        <button className="primary" type="submit">
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
