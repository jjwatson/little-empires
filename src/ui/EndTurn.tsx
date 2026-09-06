import { useState } from 'react'
import { ADVANCE_BY_ID, FACILITY_BY_ID } from '../data'
import { actionCost, add, endTurn, projectedIncome, sub, validateActions } from '../model'
import type { Empire, TurnActions } from '../model'
import { ResourceTable } from './common'

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
  const planetName = (id: string) => empire.planets.find((p) => p.id === id)?.name ?? id

  return (
    <section>
      <div className="card">
        <h2>End turn {empire.turn}</h2>
        <h3>Research</h3>
        {actions.research.length === 0 ? (
          <p className="muted">Nothing queued.</p>
        ) : (
          <ul className="compact">
            {actions.research.map((id) => (
              <li key={id}>
                {ADVANCE_BY_ID.get(id)?.name ?? id}{' '}
                <button onClick={() => onActions({ ...actions, research: actions.research.filter((r) => r !== id) })}>
                  remove
                </button>
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
                <button onClick={() => onActions({ ...actions, builds: actions.builds.filter((x) => x !== b) })}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <ResourceTable
          rows={[
            { label: 'Stockpile now', r: empire.resources },
            { label: 'Spent on actions', r: sub({ credits: 0, rawMats: 0, energy: 0, manpower: 0 }, cost), signedValues: true },
            { label: 'Income', r: income, signedValues: true },
            { label: 'Stockpile after', r: after },
          ]}
        />

        <label>
          Notes for the log (optional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. festival held, GM ruling…" />
        </label>

        {errors.map((e) => (
          <p key={e} className="error">
            {e}
          </p>
        ))}
        <button
          className="primary"
          disabled={errors.length > 0}
          onClick={() => onCommit(endTurn(empire, actions, by, notes))}
        >
          End turn and save
        </button>
      </div>

      {empire.log.length > 0 && (
        <div className="card">
          <h3>Turn log</h3>
          <table className="advances">
            <tbody>
              {[...empire.log].reverse().map((e) => (
                <tr key={e.turn}>
                  <td className="act">
                    <strong>{e.turn}</strong>
                  </td>
                  <td>
                    <div>{e.researched.map((id) => ADVANCE_BY_ID.get(id)?.name ?? id).join(', ') || 'No research'}</div>
                    <div>
                      {e.builds.map((b) => `${planetName(b.planetId)}: ${FACILITY_BY_ID.get(b.facilityId)?.name ?? b.facilityId}`).join(', ') ||
                        'No builds'}
                    </div>
                    {e.notes && <div className="muted small">{e.notes}</div>}
                    <div className="muted small">
                      {new Date(e.at).toLocaleString()} by {e.by}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
