import { useState } from 'react'
import { ADVANCE_BY_ID, BLUEPRINT_COSTS, FACILITY_BY_ID } from '../data'
import {
  ZERO,
  actionCost,
  add,
  canHostPrototype,
  endTurn,
  planetNameOf,
  projectedIncome,
  prototypePlanet,
  prototypesFor,
  sub,
  validateActions,
} from '../model'
import type { Empire, TurnActions } from '../model'
import { Res, ResourceTable, fmt } from './common'

interface Props {
  empire: Empire
  actions: TurnActions
  by: string
  onActions: (a: TurnActions) => void
  onCommit: (e: Empire) => Promise<void>
}

export function EndTurn({ empire, actions, by, onActions, onCommit }: Props) {
  const [notes, setNotes] = useState('')
  const errors = validateActions(empire, actions)
  const cost = actionCost(empire, actions)
  const income = projectedIncome(empire)
  const after = add(sub(empire.resources, cost), income)
  const planetName = (id: string) => planetNameOf(empire, id)
  const prototypes = prototypesFor(empire, actions.research)

  return (
    <section>
      <div className="card">
        <h2>End Colony Turn {empire.turn}</h2>

        <h3>Research</h3>
        {actions.research.length === 0 ? (
          <p className="muted">Nothing queued.</p>
        ) : (
          <ul className="compact">
            {actions.research.map((id) => (
              <li key={id}>
                {ADVANCE_BY_ID.get(id)?.name ?? id} <Res r={ADVANCE_BY_ID.get(id)?.cost ?? ZERO} />{' '}
                <button onClick={() => onActions({ ...actions, research: actions.research.filter((r) => r !== id) })}>remove</button>
              </li>
            ))}
          </ul>
        )}

        {prototypes.length > 0 && (
          <>
            <h3>Working prototypes</h3>
            <p className="muted small">Completing a building's research hands you one of them, its cost included in the research.</p>
            <ul className="compact">
              {prototypes.map((f) => {
                const hosts = empire.planets.filter((p) => canHostPrototype(p, f))
                const target = prototypePlanet(empire, actions, f)
                return (
                  <li key={f.id}>
                    {f.name}{' '}
                    {hosts.length === 0 ? (
                      <span className="neg small">no planet can take it, so none is granted</span>
                    ) : (
                      <>
                        on{' '}
                        <select value={target?.id ?? ''} onChange={(e) => onActions({ ...actions, prototypes: { ...actions.prototypes, [f.id]: e.target.value } })}>
                          {hosts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        <h3>Blueprints</h3>
        {actions.blueprints.length === 0 ? (
          <p className="muted">Nothing queued.</p>
        ) : (
          <ul className="compact">
            {actions.blueprints.map((b, i) => (
              <li key={i}>
                {b.name} <span className="muted">({b.scale})</span> <Res r={BLUEPRINT_COSTS[b.scale]} />
                {b.credits != null && <span className="muted small"> · list price {fmt(b.credits)} Cr</span>}{' '}
                <button onClick={() => onActions({ ...actions, blueprints: actions.blueprints.filter((_, j) => j !== i) })}>remove</button>
              </li>
            ))}
          </ul>
        )}

        <h3>Construction</h3>
        {actions.builds.length === 0 ? (
          <p className="muted">Nothing queued.</p>
        ) : (
          <ul className="compact">
            {actions.builds.map((b) => (
              <li key={b.planetId}>
                {planetName(b.planetId)}: {FACILITY_BY_ID.get(b.facilityId)?.name ?? b.facilityId}{' '}
                <button onClick={() => onActions({ ...actions, builds: actions.builds.filter((x) => x !== b) })}>remove</button>
              </li>
            ))}
          </ul>
        )}

        <ResourceTable
          rows={[
            { label: 'Stockpile now', r: empire.resources },
            { label: 'Spent on actions', r: sub(ZERO, cost), signedValues: true },
            { label: 'Income (after growth)', r: income, signedValues: true },
            { label: 'Stockpile after', r: after },
          ]}
        />

        <label>
          Notes for the ledger (optional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. festival held, GM ruling…" />
        </label>

        {errors.map((e) => (
          <p key={e} className="error">
            {e}
          </p>
        ))}
        <button className="primary" disabled={errors.length > 0} onClick={() => onCommit(endTurn(empire, actions, by, notes))}>
          End turn and save
        </button>
        <p className="muted small">Population grows, income lands, builds progress and the turn is written to the ledger.</p>
      </div>
    </section>
  )
}
