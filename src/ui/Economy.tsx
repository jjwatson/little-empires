import { useMemo, useState } from 'react'
import { FACILITY_BY_ID, FACILITY_CATEGORIES, facilityCategory, facilityIncomeOn } from '../data'
import type { FacilityCategory, ResourceSet } from '../data'
import { ZERO, add, addAdjustment, balanceAfterTurn, growthRate, isZero, ledgerTurns, mul, populationCredits, projectedIncome } from '../model'
import type { Empire, LedgerKind, LedgerLine } from '../model'
import { ResCells, ResHeaders, ResourceInputs, SubTabs, fmt, pct } from './common'

interface Props {
  empire: Empire
  by: string
  onChange: (e: Empire) => void
}

type View = 'income' | 'ledger'

export function Economy({ empire, by, onChange }: Props) {
  const [view, setView] = useState<View>('income')
  return (
    <section>
      <div className="card">
        <SubTabs<View> tabs={[['income', 'Income'], ['ledger', 'Ledger']]} value={view} onChange={setView} />
      </div>
      {view === 'income' ? <Income empire={empire} /> : <Ledger empire={empire} by={by} onChange={onChange} />}
    </section>
  )
}

// ---------------------------------------------------------------------------

interface IncomeRow {
  category: FacilityCategory | 'Planets'
  source: string
  where: string
  count: number
  per: ResourceSet
}

/** The Resources tab: monthly income by source, count × per-facility yield, grouped by category. */
function Income({ empire }: { empire: Empire }) {
  const rows = useMemo(() => {
    const out: IncomeRow[] = []
    for (const p of empire.planets) {
      const rate = growthRate(empire, p)
      out.push({
        category: 'Planets',
        source: `Planet of ${p.name}`,
        where: `${fmt(p.population)} pop, +${pct(rate)}`,
        count: 1,
        per: add(p.baseIncome, { ...ZERO, credits: populationCredits(p, rate) }),
      })
      for (const o of p.facilities) {
        const f = FACILITY_BY_ID.get(o.facilityId)
        if (!f) continue
        out.push({ category: facilityCategory(f), source: f.name, where: p.name, count: o.count, per: facilityIncomeOn(p.type, f) })
      }
    }
    return out
  }, [empire])

  const total = projectedIncome(empire)
  const categories: (FacilityCategory | 'Planets')[] = ['Planets', ...FACILITY_CATEGORIES]
  const nextTurns = [1, 2, 3, 4, 5, 6].map((n) => {
    let pop = 0
    let credits = 0
    for (const p of empire.planets) {
      const rate = growthRate(empire, p)
      const grown = p.population * Math.pow(1 + rate, n)
      pop += grown
      credits += grown * (1 + rate) * 0.1
    }
    return { turn: empire.turn + n - 1, pop, credits }
  })

  return (
    <>
      <div className="card">
        <h3>
          Total monthly income <span className="muted">· Colony Turn {empire.turn}</span>
        </h3>
        <div className="tablewrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>Source</th>
                <th>Where</th>
                <th className="num">Number</th>
                <ResHeaders />
                <th className="sep"></th>
                <ResHeaders />
              </tr>
              <tr className="subhead">
                <th></th>
                <th></th>
                <th></th>
                <th colSpan={4}>per facility per month</th>
                <th></th>
                <th colSpan={4}>produced per month</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const group = rows.filter((r) => r.category === cat)
                if (!group.length) return null
                return [
                  <tr key={cat} className="group">
                    <th colSpan={12}>{cat}</th>
                  </tr>,
                  ...group.map((r, i) => (
                    <tr key={`${cat}-${i}`}>
                      <td>{r.source}</td>
                      <td className="muted">{r.where}</td>
                      <td className="num">{r.count}</td>
                      <ResCells r={r.per} signedValues muted />
                      <td className="sep"></td>
                      <ResCells r={mul(r.per, r.count)} signedValues />
                    </tr>
                  )),
                ]
              })}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3}>Total</th>
                <td colSpan={4}></td>
                <td className="sep"></td>
                <ResCells r={total} signedValues />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="muted small">
          Planet credits are one per ten population after the turn's growth. Facilities yield from the turn after they finish.
        </p>
      </div>

      <div className="card">
        <h3>Population outlook</h3>
        <div className="tablewrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>Colony Turn</th>
                <th className="num">Population</th>
                <th className="num">Credits from population</th>
              </tr>
            </thead>
            <tbody>
              {nextTurns.map((r) => (
                <tr key={r.turn}>
                  <td>CT {r.turn}</td>
                  <td className="num">{fmt(r.pop)}</td>
                  <td className="num">{fmt(r.credits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

const KIND_LABEL: Record<LedgerKind, string> = {
  start: 'Start',
  income: 'Income',
  research: 'Research',
  prototype: 'Prototype',
  construction: 'Construction',
  blueprint: 'Blueprint',
  colony: 'Colony',
  adjustment: 'Adjustment',
}

/** The Balance Sheet tab: every line, newest turn first, with the closing balance per turn. */
function Ledger({ empire, by, onChange }: Props) {
  const turns = ledgerTurns(empire.ledger)
  const [filter, setFilter] = useState<number | 'all'>('all')
  const [adding, setAdding] = useState(false)
  const planetName = (id?: string) => (id ? empire.planets.find((p) => p.id === id)?.name ?? '' : '')
  const shown = filter === 'all' ? turns : turns.filter((t) => t === filter)

  return (
    <>
      <div className="card">
        <div className="row wrap">
          <h3 style={{ margin: 0 }}>Balance sheet</h3>
          <select value={String(filter)} onChange={(e) => setFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All turns</option>
            {turns.map((t) => (
              <option key={t} value={t}>
                {t === 0 ? 'Start' : `Colony Turn ${t}`}
              </option>
            ))}
          </select>
          <span className="muted small">
            {empire.ledger.length} line{empire.ledger.length === 1 ? '' : 's'}
          </span>
          <button style={{ marginLeft: 'auto' }} onClick={() => setAdding(!adding)}>
            {adding ? 'Cancel' : 'Add adjustment…'}
          </button>
        </div>
        {adding && (
          <Adjustment
            onAdd={(label, delta, notes) => {
              onChange(addAdjustment(empire, label, delta, by, notes))
              setAdding(false)
            }}
          />
        )}
      </div>

      {shown.map((t) => {
        const lines = empire.ledger.filter((l) => l.turn === t)
        const closing = balanceAfterTurn(empire.ledger, t)
        return (
          <div className="card" key={t}>
            <h3>
              {t === 0 ? 'Colony start' : `Colony Turn ${t}`}{' '}
              {t === empire.turn && <span className="muted small">· current, not yet ended</span>}
            </h3>
            <div className="tablewrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Item</th>
                    <th>Where</th>
                    <ResHeaders />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <LedgerRow key={l.id} line={l} where={planetName(l.planetId)} />
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>Balance at close of {t === 0 ? 'start' : `CT ${t}`}</th>
                    <ResCells r={closing} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}
    </>
  )
}

function LedgerRow({ line, where }: { line: LedgerLine; where: string }) {
  return (
    <tr className={line.kind}>
      <td>
        <span className={`kind ${line.kind}`}>{KIND_LABEL[line.kind]}</span>
      </td>
      <td>
        {line.label}
        {line.notes && <div className="muted small">{line.notes}</div>}
        <div className="muted small" title={line.at}>
          {new Date(line.at).toLocaleDateString()} · {line.by}
        </div>
      </td>
      <td className="muted">{where}</td>
      {isZero(line.delta) ? <td colSpan={4} className="muted small">no cost</td> : <ResCells r={line.delta} signedValues />}
    </tr>
  )
}

function Adjustment({ onAdd }: { onAdd: (label: string, delta: ResourceSet, notes?: string) => void }) {
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [delta, setDelta] = useState<ResourceSet>(ZERO)
  return (
    <form
      className="inner"
      onSubmit={(e) => {
        e.preventDefault()
        if (!label.trim() || isZero(delta)) return
        onAdd(label.trim(), delta, notes.trim() || undefined)
      }}
    >
      <label>
        What happened
        <input placeholder="e.g. Repairs to the Venturer, GM grant, festival" value={label} onChange={(e) => setLabel(e.target.value)} required />
      </label>
      <h4>Change to the stockpile (negative to spend)</h4>
      <ResourceInputs value={delta} onChange={setDelta} />
      <label>
        Notes (optional)
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button className="primary" type="submit" disabled={!label.trim() || isZero(delta)}>
        Add to ledger
      </button>
    </form>
  )
}
