import { RESOURCE_KEYS, RESOURCE_LABELS } from '../data'
import type { ResourceSet } from '../data'
import type { AdvanceStatus } from '../model'

export const fmt = (n: number): string => (Number.isInteger(n) ? n : Math.round(n)).toLocaleString()

export function signed(n: number): string {
  return (n > 0 ? '+' : '') + fmt(n)
}

/** A fraction as a percentage, e.g. 0.02 -> "2%". */
export const pct = (n: number): string => `${Number((n * 100).toFixed(2))}%`

export const SHORT: Record<keyof ResourceSet, string> = { credits: 'Cr', rawMats: 'RM', energy: 'En', manpower: 'MP' }

/** Inline display of a resource set, e.g. "50,000 Cr · 1,500 RM · 1,000 En · 500 MP". */
export function Res({ r, signedValues = false }: { r: ResourceSet; signedValues?: boolean }) {
  return (
    <span className="res">
      {RESOURCE_KEYS.map((k) => (
        <span key={k} className={signedValues ? (r[k] > 0 ? 'pos' : r[k] < 0 ? 'neg' : '') : ''}>
          {signedValues ? signed(r[k]) : fmt(r[k])} {SHORT[k]}
        </span>
      ))}
    </span>
  )
}

/** Four numeric cells for a resource set, for use inside a table row. */
export function ResCells({ r, signedValues = false, muted = false }: { r: ResourceSet; signedValues?: boolean; muted?: boolean }) {
  return (
    <>
      {RESOURCE_KEYS.map((k) => (
        <td
          key={k}
          className={`num ${muted ? 'muted' : signedValues ? (r[k] > 0 ? 'pos' : r[k] < 0 ? 'neg' : '') : ''}`}
        >
          {signedValues ? signed(r[k]) : fmt(r[k])}
        </td>
      ))}
    </>
  )
}

export function ResHeaders() {
  return (
    <>
      {RESOURCE_KEYS.map((k) => (
        <th key={k} className="num">
          {RESOURCE_LABELS[k]}
        </th>
      ))}
    </>
  )
}

export function ResourceTable({ rows }: { rows: { label: string; r: ResourceSet; signedValues?: boolean }[] }) {
  return (
    <table className="restable">
      <thead>
        <tr>
          <th></th>
          <ResHeaders />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th>{row.label}</th>
            <ResCells r={row.r} signedValues={row.signedValues} />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ResourceInputs({ value, onChange }: { value: ResourceSet; onChange: (r: ResourceSet) => void }) {
  return (
    <div className="resinputs">
      {RESOURCE_KEYS.map((k) => (
        <label key={k}>
          {RESOURCE_LABELS[k]}
          <input type="number" value={value[k]} onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })} />
        </label>
      ))}
    </div>
  )
}

export function SubTabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map(([id, label]) => (
        <button key={id} className={id === value ? 'active' : ''} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  )
}

/** The tick / Queue / lock control for an advance, shared by the research table and graph. */
export function QueueButton({
  status,
  queued,
  slots,
  queuedCount,
  onToggle,
}: {
  status: AdvanceStatus
  queued: boolean
  slots: number
  queuedCount: number
  onToggle: () => void
}) {
  if (status === 'researched') return <span title="Researched">✓</span>
  if (status === 'locked') return <span title="Locked">🔒</span>
  return (
    <button className={queued ? 'primary' : ''} disabled={!queued && queuedCount >= slots} onClick={onToggle}>
      {queued ? 'Queued' : 'Queue'}
    </button>
  )
}
