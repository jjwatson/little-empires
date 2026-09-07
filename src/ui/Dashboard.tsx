import { useState } from 'react'
import { FACILITY_BY_ID, PLANET_TYPES } from '../data'
import type { PlanetType, ResourceSet } from '../data'
import {
  COLONY_POPULATION,
  COLONY_SETUP_COST,
  HOMEWORLD_MIN_POPULATION,
  ZERO,
  actionCost,
  activeBonuses,
  blueprintSlots,
  colonyProblems,
  foundColony,
  governmentOptions,
  growthRate,
  ledgerTurns,
  planetIncome,
  projectedIncome,
  researchSlots,
  sub,
} from '../model'
import type { Empire, TurnActions } from '../model'
import { Res, ResourceInputs, ResourceTable, fmt, pct } from './common'

interface Props {
  empire: Empire
  actions: TurnActions
  by: string
  onChange: (e: Empire) => void
}

export function Overview({ empire, actions, by, onChange }: Props) {
  const [founding, setFounding] = useState(false)
  const income = projectedIncome(empire)
  const cost = actionCost(empire, actions)
  const population = empire.planets.reduce((n, p) => n + p.population, 0)
  const governments = governmentOptions(empire)
  const bonuses = activeBonuses(empire)
  const recentTurns = ledgerTurns(empire.ledger).filter((t) => t > 0).slice(0, 5)

  return (
    <section>
      <div className="card">
        <h2>
          {empire.name} <span className="muted">· Colony Turn {empire.turn}</span>
        </h2>
        <ResourceTable
          rows={[
            { label: 'Stockpile', r: empire.resources },
            { label: 'Income next turn', r: income, signedValues: true },
            { label: 'Queued this turn', r: sub(ZERO, cost), signedValues: true },
          ]}
        />
        <p className="muted">
          Population {fmt(population)} · Research slots {researchSlots(empire)} · Blueprint slots {blueprintSlots(empire)} ·
          Advances {empire.researched.length} · Planets {empire.planets.length}
        </p>
      </div>

      <div className="grid">
        {empire.planets.map((p) => {
          const rate = growthRate(empire, p)
          return (
            <div className="card" key={p.id}>
              <h3>
                {p.name} <span className="muted">· {PLANET_TYPES.find((t) => t.id === p.type)?.name}</span>
              </h3>
              <p className="muted">
                Population {fmt(p.population)} · growing {pct(rate)} a turn
              </p>
              <p>
                Income: <Res r={planetIncome(p, rate)} signedValues />
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
          )
        })}
      </div>

      <div className="card">
        <h3>Bonuses in effect</h3>
        {governments.length > 0 && (
          <label>
            Governmental system in operation
            <select value={empire.government ?? ''} onChange={(e) => onChange({ ...empire, government: e.target.value || undefined })}>
              <option value="">None</option>
              {governments.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {bonuses.length === 0 ? (
          <p className="muted">Nothing researched yet that changes the numbers.</p>
        ) : (
          <table className="advances">
            <tbody>
              {bonuses.map((b) => (
                <tr key={b.source}>
                  <td className="act">
                    <strong>{b.source}</strong>
                    <div className="muted small">{b.field}</div>
                  </td>
                  <td>{b.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">
          Population growth bonuses are applied automatically. Other percentages are listed for reference and still need
          applying by hand.
        </p>
      </div>

      <div className="card">
        <h3>Found a new colony</h3>
        <p className="muted">
          Costs <Res r={COLONY_SETUP_COST} /> and moves {fmt(COLONY_POPULATION)} population from the homeworld (which
          cannot drop below {fmt(HOMEWORLD_MIN_POPULATION)}).
        </p>
        {founding ? (
          <FoundColony empire={empire} by={by} onCancel={() => setFounding(false)} onChange={onChange} />
        ) : (
          <button onClick={() => setFounding(true)}>Found colony…</button>
        )}
      </div>

      {recentTurns.length > 0 && (
        <div className="card">
          <h3>Recent turns</h3>
          <ul className="compact">
            {recentTurns.map((t) => {
              const lines = empire.ledger.filter((l) => l.turn === t)
              const research = lines.filter((l) => l.kind === 'research').map((l) => l.label)
              const builds = lines.filter((l) => l.kind === 'construction' || l.kind === 'prototype').map((l) => l.label)
              const other = lines.filter((l) => ['blueprint', 'colony', 'adjustment'].includes(l.kind)).map((l) => l.label)
              return (
                <li key={t}>
                  <strong>Turn {t}</strong> {research.join(', ') || 'no research'}; {builds.join(', ') || 'no builds'}
                  {other.length ? `; ${other.join(', ')}` : ''}
                </li>
              )
            })}
          </ul>
          <p className="muted small">Full detail is on the Economy tab under Ledger.</p>
        </div>
      )}
    </section>
  )
}

function FoundColony({ empire, by, onCancel, onChange }: { empire: Empire; by: string; onCancel: () => void; onChange: (e: Empire) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<PlanetType>('arid')
  const [baseIncome, setBaseIncome] = useState<ResourceSet>({ credits: 0, rawMats: 200, energy: 200, manpower: 200 })
  const problems = colonyProblems(empire)

  return (
    <form
      className="inner"
      onSubmit={(e) => {
        e.preventDefault()
        if (problems.length || !name.trim()) return
        onChange(foundColony(empire, name.trim(), type, baseIncome, by))
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
      <h4>Base income per turn besides population credits (agree with your GM)</h4>
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
