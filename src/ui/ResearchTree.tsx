import { useMemo, useState } from 'react'
import { ADVANCES, BLUEPRINT_COSTS, BLUEPRINT_SCALES, FACILITIES, FIELDS } from '../data'
import type { Advance, BlueprintScale } from '../data'
import { advanceStatus, blueprintSlots, missingPrereqs, prereqMet, researchSlots, unlockedTier } from '../model'
import type { Empire, TurnActions } from '../model'
import { QueueButton, Res, SubTabs } from './common'
import { ResearchGraph } from './ResearchGraph'

interface Props {
  empire: Empire
  actions: TurnActions
  onActions: (a: TurnActions) => void
}

type View = 'table' | 'graph'
const VIEW_KEY = 'little-empires.researchView'

export function ResearchTree({ empire, actions, onActions }: Props) {
  const [view, setViewState] = useState<View>(() => (localStorage.getItem(VIEW_KEY) === 'graph' ? 'graph' : 'table'))
  const [field, setField] = useState<string>(FIELDS[0])
  const [query, setQuery] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const researched = useMemo(() => new Set(empire.researched), [empire.researched])
  const slots = researchSlots(empire)

  function setView(v: View) {
    setViewState(v)
    localStorage.setItem(VIEW_KEY, v)
  }

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
      <div className="grid">
        <Unlocked researched={researched} />
        <Blueprints empire={empire} actions={actions} onActions={onActions} />
      </div>

      <div className="card">
        <div className="row wrap">
          <SubTabs tabs={[['table', 'Table'], ['graph', 'Graph']]} value={view} onChange={setView} />
          <input placeholder="Search all fields…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="inline">
            <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
            available only
          </label>
          <span className="muted">
            Queued {actions.research.length}/{slots} research slot{slots === 1 ? '' : 's'}
          </span>
        </div>
        {view === 'table' && !query && (
          <div className="tabs">
            {FIELDS.map((f) => (
              <button key={f} className={f === field ? 'active' : ''} onClick={() => setField(f)}>
                {f} <small>T{unlockedTier(f, researched)}</small>
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'graph' ? (
        <ResearchGraph
          empireName={empire.name}
          researched={researched}
          queued={actions.research}
          slots={slots}
          query={query}
          onlyAvailable={onlyAvailable}
          onToggle={toggle}
        />
      ) : (
        [1, 2, 3, 4, 5].map((tier) => {
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
                          <QueueButton
                            status={status}
                            queued={queued}
                            slots={slots}
                            queuedCount={actions.research.length}
                            onToggle={() => toggle(a)}
                          />
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
        })
      )}
    </section>
  )
}

/** The sheet's "Available Trees / Tier Unlocked / Available Construction Items" summary. */
function Unlocked({ researched }: { researched: ReadonlySet<string> }) {
  const trees = FIELDS.map((f) => ({ field: f, tier: unlockedTier(f, researched), started: ADVANCES.some((a) => a.field === f && researched.has(a.id)) }))
  const buildable = FACILITIES.filter((f) => (f.requires.all || f.requires.any) && prereqMet(f.requires, researched))
  return (
    <div className="card">
      <h3>Unlocked</h3>
      <div className="chips">
        {trees.map((t) => (
          <span key={t.field} className={`chip ${t.started ? 'on' : ''}`} title={t.started ? 'Research under way' : 'Nothing researched yet'}>
            {t.field} <small>T{t.tier}</small>
          </span>
        ))}
      </div>
      <h4>Available construction items</h4>
      {buildable.length === 0 ? (
        <p className="muted">Nothing yet. Infrastructure Research opens the first buildings.</p>
      ) : (
        <p className="small">{buildable.map((f) => f.name).join(' · ')}</p>
      )}
    </div>
  )
}

/** Reverse Engineering: one blueprint per research facility per turn, priced by scale. */
function Blueprints({ empire, actions, onActions }: Props) {
  const [name, setName] = useState('')
  const [scale, setScale] = useState<BlueprintScale>('Character')
  const slots = blueprintSlots(empire)
  const unlocked = empire.researched.includes('reverse-engineering')

  function addBlueprint() {
    if (!name.trim()) return
    onActions({ ...actions, blueprints: [...actions.blueprints, { name: name.trim(), scale }] })
    setName('')
  }

  return (
    <div className="card">
      <h3>Blueprints</h3>
      {!unlocked ? (
        <p className="muted">Research Reverse Engineering to copy items you possess.</p>
      ) : slots === 0 ? (
        <p className="muted">Reverse Engineering is known, but you need a research lab for each blueprint per turn.</p>
      ) : (
        <>
          <p className="muted small">
            Queued {actions.blueprints.length}/{slots} this turn. Only common items (availability 2 or less); check with the GM.
          </p>
          <ul className="compact">
            {actions.blueprints.map((b, i) => (
              <li key={i}>
                {b.name} <span className="muted">({b.scale})</span> <Res r={BLUEPRINT_COSTS[b.scale]} />{' '}
                <button onClick={() => onActions({ ...actions, blueprints: actions.blueprints.filter((_, j) => j !== i) })}>remove</button>
              </li>
            ))}
          </ul>
          {actions.blueprints.length < slots && (
            <div className="row wrap">
              <input placeholder="Item, e.g. E-11 blaster rifle" value={name} onChange={(e) => setName(e.target.value)} />
              <select value={scale} onChange={(e) => setScale(e.target.value as BlueprintScale)}>
                {BLUEPRINT_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s} scale
                  </option>
                ))}
              </select>
              <button onClick={addBlueprint} disabled={!name.trim()}>
                Queue blueprint
              </button>
            </div>
          )}
        </>
      )}
      {empire.blueprints.length > 0 && (
        <>
          <h4>Blueprints held</h4>
          <p className="small">{empire.blueprints.map((b) => `${b.name} (${b.scale})`).join(' · ')}</p>
        </>
      )}
    </div>
  )
}
