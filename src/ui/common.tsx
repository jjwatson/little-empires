import { RESOURCE_KEYS, RESOURCE_LABELS } from '../data'
import type { ResourceSet } from '../data'

export const fmt = (n: number): string => (Number.isInteger(n) ? n : Math.round(n)).toLocaleString()

export function signed(n: number): string {
  return (n > 0 ? '+' : '') + fmt(n)
}

/** Inline display of a resource set, e.g. "50,000 Cr · 1,500 RM · 1,000 En · 500 MP". */
export function Res({ r, signedValues = false }: { r: ResourceSet; signedValues?: boolean }) {
  const short: Record<keyof ResourceSet, string> = { credits: 'Cr', rawMats: 'RM', energy: 'En', manpower: 'MP' }
  return (
    <span className="res">
      {RESOURCE_KEYS.map((k) => (
        <span key={k} className={signedValues ? (r[k] > 0 ? 'pos' : r[k] < 0 ? 'neg' : '') : ''}>
          {signedValues ? signed(r[k]) : fmt(r[k])} {short[k]}
        </span>
      ))}
    </span>
  )
}

export function ResourceTable({ rows }: { rows: { label: string; r: ResourceSet; signedValues?: boolean }[] }) {
  return (
    <table className="restable">
      <thead>
        <tr>
          <th></th>
          {RESOURCE_KEYS.map((k) => (
            <th key={k}>{RESOURCE_LABELS[k]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th>{row.label}</th>
            {RESOURCE_KEYS.map((k) => (
              <td key={k} className={row.signedValues ? (row.r[k] > 0 ? 'pos' : row.r[k] < 0 ? 'neg' : '') : ''}>
                {row.signedValues ? signed(row.r[k]) : fmt(row.r[k])}
              </td>
            ))}
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
          <input
            type="number"
            value={value[k]}
            onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })}
          />
        </label>
      ))}
    </div>
  )
}
