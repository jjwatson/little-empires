import { useState } from 'react'
import { FACILITY_BY_ID, PLANET_TYPES, facilityCostOn, facilityIncomeOn } from '../data'
import {
  PROFILE_FIELDS,
  availableBuilds,
  growthRate,
  oncePerPlanet,
  planetHas,
  planetIncome,
  populationCredits,
  withSpecies,
} from '../model'
import type { Empire, Planet, Species, TurnActions } from '../model'
import { Res, ResourceInputs, fmt, pct } from './common'

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
  const rate = growthRate(empire, planet)

  const queued = actions.builds.find((b) => b.planetId === planet.id)
  const options = availableBuilds(empire, planet).filter(
    (f) => !query || f.name.toLowerCase().includes(query.toLowerCase()),
  )

  function setBuild(facilityId: string | null) {
    const builds = actions.builds.filter((b) => b.planetId !== planet.id)
    if (facilityId) builds.push({ planetId: planet.id, facilityId })
    onActions({ ...actions, builds })
  }

  function updatePlanet(next: Planet) {
    onChange({ ...empire, planets: empire.planets.map((p) => (p.id === planet.id ? next : p)) })
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
          <PlanetEditor
            planet={planet}
            onSave={(next) => {
              updatePlanet(next)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <p>
              Population {fmt(planet.population)} · growing {pct(rate)} a turn
              {planet.growthAdjust ? ` (includes GM adjustment ${pct(planet.growthAdjust)})` : ''} · yields{' '}
              {fmt(populationCredits(planet, rate))} Cr <button onClick={() => setEditing(true)}>edit</button>
            </p>
            <p>
              Other base income <Res r={planet.baseIncome} signedValues /> · Total income{' '}
              <Res r={planetIncome(planet, rate)} signedValues />
            </p>
          </>
        )}
      </div>

      <div className="grid">
        <ProfileCard planet={planet} onSave={updatePlanet} />
        <SpeciesCard planet={planet} onSave={updatePlanet} />
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
                  const blocked = oncePerPlanet(f.id) && planetHas(planet, f.id)
                  return (
                    <tr key={f.id} className={isQueued ? 'available' : blocked ? 'locked' : ''}>
                      <td className="act">
                        {blocked ? (
                          <span className="muted small">built</span>
                        ) : (
                          <button className={isQueued ? 'primary' : ''} onClick={() => setBuild(isQueued ? null : f.id)}>
                            {isQueued ? 'Queued' : 'Queue'}
                          </button>
                        )}
                      </td>
                      <td>
                        <strong>{f.name}</strong>
                        <div className="muted small">{f.effects}</div>
                        {f.notes && <div className="muted small">{f.notes}</div>}
                        {f.requires.note && <div className="muted small">Note: {f.requires.note}</div>}
                        {oncePerPlanet(f.id) && <div className="muted small">One per planet; each adds a research slot.</div>}
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

function PlanetEditor({ planet, onSave, onCancel }: { planet: Planet; onSave: (p: Planet) => void; onCancel: () => void }) {
  const [population, setPopulation] = useState(Math.round(planet.population))
  const [growthPct, setGrowthPct] = useState(planet.growthAdjust * 100)
  const [baseIncome, setBaseIncome] = useState(planet.baseIncome)
  const hasSpecies = planet.species.length > 0
  return (
    <form
      className="inner"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ ...planet, population: hasSpecies ? planet.population : population, growthAdjust: growthPct / 100, baseIncome })
      }}
    >
      <label>
        Population {hasSpecies && <span className="muted small">(set by the species table)</span>}
        <input type="number" value={population} disabled={hasSpecies} onChange={(e) => setPopulation(Number(e.target.value))} />
      </label>
      <label>
        GM growth adjustment, % per turn (base 1% plus research bonuses is automatic)
        <input type="number" step="0.1" value={growthPct} onChange={(e) => setGrowthPct(Number(e.target.value))} />
      </label>
      <h4>Base income per turn besides population credits</h4>
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

function ProfileCard({ planet, onSave }: { planet: Planet; onSave: (p: Planet) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>(planet.profile)
  const filled = PROFILE_FIELDS.filter((k) => planet.profile[k])
  return (
    <div className="card">
      <h3>
        Profile{' '}
        {!editing && (
          <button
            onClick={() => {
              setDraft(planet.profile)
              setEditing(true)
            }}
          >
            edit
          </button>
        )}
      </h3>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const profile = Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim()))
            onSave({ ...planet, profile })
            setEditing(false)
          }}
        >
          {PROFILE_FIELDS.map((k) => (
            <label key={k} className="tight">
              {k}
              <input value={draft[k] ?? ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
            </label>
          ))}
          <div className="row">
            <button className="primary" type="submit">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : filled.length === 0 ? (
        <p className="muted">No description yet. Star, atmosphere, terrain, starport, exports…</p>
      ) : (
        <table className="kv">
          <tbody>
            {filled.map((k) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{planet.profile[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function SpeciesCard({ planet, onSave }: { planet: Planet; onSave: (p: Planet) => void }) {
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<Species[]>(planet.species)
  const total = rows.reduce((n, s) => n + s.population, 0)

  function start() {
    setRows(planet.species.length ? planet.species.map((s) => ({ ...s, population: Math.round(s.population) })) : [{ name: '', population: Math.round(planet.population) }])
    setEditing(true)
  }

  return (
    <div className="card">
      <h3>Demographics {!editing && <button onClick={start}>edit</button>}</h3>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSave(withSpecies(planet, rows.filter((s) => s.name.trim() && s.population > 0)))
            setEditing(false)
          }}
        >
          <table className="kv">
            <tbody>
              {rows.map((s, i) => (
                <tr key={i}>
                  <td>
                    <input placeholder="Species" value={s.name} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={s.population}
                      onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, population: Number(e.target.value) } : r)))}
                    />
                  </td>
                  <td>
                    <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Total {fmt(total)}. Leaving the table empty keeps a single population figure.</p>
          <div className="row">
            <button type="button" onClick={() => setRows([...rows, { name: '', population: 0 }])}>
              Add species
            </button>
            <button className="primary" type="submit">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : planet.species.length === 0 ? (
        <p className="muted">Single population figure of {fmt(planet.population)}. Add species to track them separately.</p>
      ) : (
        <table className="kv">
          <tbody>
            {planet.species.map((s) => (
              <tr key={s.name}>
                <th>{s.name}</th>
                <td className="num">{fmt(s.population)}</td>
                <td className="num muted">{pct(s.population / planet.population)}</td>
              </tr>
            ))}
            <tr>
              <th>Total</th>
              <td className="num">
                <strong>{fmt(planet.population)}</strong>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
