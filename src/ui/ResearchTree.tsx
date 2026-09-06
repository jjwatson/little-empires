import { useMemo, useState } from 'react'
import { ADVANCES, FIELDS } from '../data'
import type { Advance } from '../data'
import { advanceStatus, missingPrereqs, researchSlots, unlockedTier } from '../model'
import type { Empire, TurnActions } from '../model'
import { Res } from './common'

interface Props {
  empire: Empire
  actions: TurnActions
  onActions: (a: TurnActions) => void
}

export function ResearchTree({ empire, actions, onActions }: Props) {
  const [field, setField] = useState<string>(FIELDS[0])
  const [query, setQuery] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const researched = useMemo(() => new Set(empire.researched), [empire.researched])
  const slots = researchSlots(empire)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ADVANCES.filter((a) => {
      if (q) return a.name.toLowerCase().includes(q) || a.effects.toLowerCase().includes(q)
      return a.field === field
    }).filter((a) => !onlyAvailable || advanceStatus(a, researched) === 'available')
  }, [field, query, onlyAvailable, researched])

  function toggle(a: Advance) {
    const has = actions.research.includes(a.id)
    const research = has ? actions.research.filter((id) => id !== a.id) : [...actions.research, a.id]
    onActions({ ...actions, research })
  }

  return (
    <section>
      <div className="card">
        <div className="row wrap">
          <input placeholder="Search all fields…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="inline">
            <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
            available only
          </label>
          <span className="muted">
            Queued {actions.research.length}/{slots} research slot{slots === 1 ? '' : 's'}
          </span>
        </div>
        {!query && (
          <div className="tabs">
            {FIELDS.map((f) => (
              <button key={f} className={f === field ? 'active' : ''} onClick={() => setField(f)}>
                {f} <small>T{unlockedTier(f, researched)}</small>
              </button>
            ))}
          </div>
        )}
      </div>

      {[1, 2, 3, 4, 5].map((tier) => {
        const rows = shown.filter((a) => a.tier === tier)
        if (!rows.length) return null
        return (
          <div className="card" key={tier}>
            <h3>Tier {tier}</h3>
            <table className="advances">
              <tbody>
                {rows.map((a) => {
                  const status = advanceStatus(a, researched)
                  const queued = actions.research.includes(a.id)
                  const missing = status === 'locked' ? missingPrereqs(a.prereq, researched) : []
                  return (
                    <tr key={a.id} className={status}>
                      <td className="act">
                        {status === 'researched' ? (
                          <span title="Researched">✓</span>
                        ) : status === 'available' ? (
                          <button
                            className={queued ? 'primary' : ''}
                            disabled={!queued && actions.research.length >= slots}
                            onClick={() => toggle(a)}
                          >
                            {queued ? 'Queued' : 'Queue'}
                          </button>
                        ) : (
                          <span title="Locked">🔒</span>
                        )}
                      </td>
                      <td>
                        <strong>{a.name}</strong>
                        {query && <span className="muted"> · {a.field}</span>}
                        <div className="muted small">{a.effects}</div>
                        {a.notes && <div className="muted small">{a.notes}</div>}
                        {missing.length > 0 && <div className="small neg">Needs: {missing.join('; ')}</div>}
                        {status === 'locked' && missing.length === 0 && (
                          <div className="small neg">Needs Tier {a.tier} of {a.field} unlocked.</div>
                        )}
                        {a.prereq.note && <div className="small muted">Note: {a.prereq.note}</div>}
                      </td>
                      <td className="cost">
                        <Res r={a.cost} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </section>
  )
}
