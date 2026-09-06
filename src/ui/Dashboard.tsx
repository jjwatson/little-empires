import { useState } from 'react'
import { ADVANCE_BY_ID, FACILITY_BY_ID, PLANET_TYPES } from '../data'
import type { PlanetType, ResourceSet } from '../data'
import {
  COLONY_POPULATION,
  COLONY_SETUP_COST,
  HOMEWORLD_MIN_POPULATION,
  actionCost,
  covers,
  newPlanet,
  planetIncome,
  projectedIncome,
  researchSlots,
  sub,
} from '../model'
import type { Empire, TurnActions } from '../model'
import { Res, ResourceInputs, ResourceTable, fmt } from './common'

interface Props {
  empire: Empire
  actions: TurnActions
  onChange: (e: Empire) => void
}

export function Dashboard({ empire, actions, onChange }: Props) {
  const [founding, setFounding] = useState(false)
  const income = projectedIncome(empire)
  const cost = actionCost(empire, actions)

  return (
    <section>
      <div className="card">
        <h2>
          {empire.name} <span className="muted">· Turn {empire.turn}</span>
        </h2>
        <ResourceTable
          rows={[
            { label: 'Stockpile', r: empire.resources },
            { label: 'Income next turn', r: income, signedValues: true },
            { label: 'Queued this turn', r: sub({ credits: 0, rawMats: 0, energy: 0, manpower: 0 }, cost), signedValues: true },
          ]}
        />
        <p className="muted">
          Research slots: {researchSlots(empire)} · Researched advances: {empire.researched.length} · Planets:{' '}
          {empire.planets.length}
        </p>
      </div>

      <div className="grid">
        {empire.planets.map((p) => (
          <div className="card" key={p.id}>
            <h3>
              {p.name} <span className="muted">· {PLANET_TYPES.find((t) => t.id === p.type)?.name}</span>
            </h3>
            <p className="muted">Population {fmt(p.population)}</p>
            <p>
              Income: <Res r={planetIncome(p)} signedValues />
            </p>
            {p.facilities.length === 0 && !p.inProgress && <p className="muted">No facilities yet.</p>}
            <ul className="compact">
              {p.facilities.map((f) => (
                <li key={f.facilityId}>
                  {FACILITY_BY_ID.get(f.facilityId)?.name ?? f.facilityId}
                  {f.count > 1 ? ` ×${f.count}` : ''}
                </li>
              ))}
              {p.inProgress && (
                <li className="muted">
                  Building {FACILITY_BY_ID.get(p.inProgress.facilityId)?.name} ({p.inProgress.turnsLeft} turn
                  {p.inProgress.turnsLeft === 1 ? '' : 's'} left)
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Found a new colony</h3>
        <p className="muted">
          Costs <Res r={COLONY_SETUP_COST} /> and moves {fmt(COLONY_POPULATION)} population from the homeworld (which
          cannot drop below {fmt(HOMEWORLD_MIN_POPULATION)}).
        </p>
        {founding ? (
          <FoundColony empire={empire} onCancel={() => setFounding(false)} onChange={onChange} />
        ) : (
          <button onClick={() => setFounding(true)}>Found colony…</button>
        )}
      </div>

      {empire.log.length > 0 && (
        <div className="card">
          <h3>Recent turns</h3>
          <ul className="compact">
            {[...empire.log]
              .reverse()
              .slice(0, 5)
              .map((e) => (
                <li key={e.turn}>
                  <strong>Turn {e.turn}</strong>{' '}
                  {e.researched.map((id) => ADVANCE_BY_ID.get(id)?.name ?? id).join(', ') || 'no research'};{' '}
                  {e.builds.map((b) => FACILITY_BY_ID.get(b.facilityId)?.name ?? b.facilityId).join(', ') || 'no builds'}
                  {e.notes ? ` — ${e.notes}` : ''}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function FoundColony({ empire, onCancel, onChange }: { empire: Empire; onCancel: () => void; onChange: (e: Empire) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<PlanetType>('arid')
  const [baseIncome, setBaseIncome] = useState<ResourceSet>({ credits: 5_000, rawMats: 200, energy: 200, manpower: 200 })
  const home = empire.planets[0]
  const problems: string[] = []
  if (!covers(empire.resources, COLONY_SETUP_COST)) problems.push('Not enough resources for the setup cost.')
  if (home.population - COLONY_POPULATION < HOMEWORLD_MIN_POPULATION) problems.push('Homeworld population would fall too low.')

  return (
    <form
      className="inner"
      onSubmit={(e) => {
        e.preventDefault()
        if (problems.length || !name.trim()) return
        const planet = newPlanet(name.trim(), type, COLONY_POPULATION, baseIncome)
        onChange({
          ...empire,
          resources: sub(empire.resources, COLONY_SETUP_COST),
          planets: [{ ...home, population: home.population - COLONY_POPULATION }, ...empire.planets.slice(1), planet],
        })
        onCancel()
      }}
    >
      <label>
        Planet name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Planet type
        <select value={type} onChange={(e) => setType(e.target.value as PlanetType)}>
          {PLANET_TYPES.filter((t) => t.id !== 'homeworld').map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">{PLANET_TYPES.find((t) => t.id === type)?.summary}</p>
      <h4>Base income per turn (agree with your GM)</h4>
      <ResourceInputs value={baseIncome} onChange={setBaseIncome} />
      {problems.map((p) => (
        <p key={p} className="error">
          {p}
        </p>
      ))}
      <div className="row">
        <button className="primary" type="submit" disabled={problems.length > 0}>
          Found colony
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
