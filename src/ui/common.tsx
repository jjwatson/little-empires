import type { ReactNode } from 'react'
import { RESOURCE_KEYS, RESOURCE_LABELS } from '../data'
import type { ResourceSet } from '../data'
import { ZERO, isZero } from '../model'
import type { AdvanceStatus, EditNote } from '../model'

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

// --- GM edits ----------------------------------------------------------------------------

/** Draft of the reason (and optional stockpile change) attached to every GM edit. */
export interface EditNoteDraft {
  label: string
  delta: ResourceSet
  notes: string
  adjustStock: boolean
}
export const EMPTY_EDIT_NOTE: EditNoteDraft = { label: '', delta: ZERO, notes: '', adjustStock: false }
export const editNoteValid = (v: EditNoteDraft): boolean => v.label.trim().length > 0
export function toEditNote(v: EditNoteDraft): EditNote {
  return {
    label: v.label.trim(),
    delta: v.adjustStock && !isZero(v.delta) ? v.delta : undefined,
    notes: v.notes.trim() || undefined,
  }
}

/** Reason, optional stockpile change and notes, shared by every GM edit form. */
export function EditNoteFields({ value, onChange, placeholder }: { value: EditNoteDraft; onChange: (v: EditNoteDraft) => void; placeholder?: string }) {
  return (
    <>
      <label>
        What happened
        <input
          required
          placeholder={placeholder ?? 'e.g. Captured from pirates in session 12'}
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
        />
      </label>
      <label className="inline">
        <input type="checkbox" checked={value.adjustStock} onChange={(e) => onChange({ ...value, adjustStock: e.target.checked })} />
        Also change the stockpile (negative to spend)
      </label>
      {value.adjustStock && <ResourceInputs value={value.delta} onChange={(delta) => onChange({ ...value, delta })} />}
      <label>
        Notes (optional)
        <input value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </label>
    </>
  )
}

/** The inline confirmation every GM edit uses: what will happen, any extra fields, the reason, Confirm / Cancel. */
export function GmForm({
  title,
  hint,
  confirm,
  danger = false,
  disabled = false,
  placeholder,
  note,
  onNote,
  onSubmit,
  onCancel,
  children,
}: {
  title: string
  hint?: string
  confirm: string
  danger?: boolean
  disabled?: boolean
  placeholder?: string
  note: EditNoteDraft
  onNote: (n: EditNoteDraft) => void
  onSubmit: () => void
  onCancel: () => void
  children?: ReactNode
}) {
  const ok = editNoteValid(note) && !disabled
  return (
    <form
      className="inner"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onSubmit()
      }}
    >
      <h4>{title}</h4>
      {hint && <p className="gmnote">{hint}</p>}
      {children}
      <EditNoteFields value={note} onChange={onNote} placeholder={placeholder} />
      <div className="row">
        <button className={danger ? 'primary danger' : 'primary'} type="submit" disabled={!ok}>
          {confirm}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
