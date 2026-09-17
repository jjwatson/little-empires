import { useEffect, useMemo, useState } from 'react'
import { blueprintWarning, itemUrl, loadItemStats, loadItems, searchItems } from '../data'
import type { Item, ItemIndex, ItemStats } from '../data'
import { fmt } from './common'

/** The D6 Holocron item list, fetched the first time a screen that needs it is shown. */
export function useItems(enabled = true): ItemIndex | undefined {
  const [index, setIndex] = useState<ItemIndex>()
  useEffect(() => {
    if (!enabled || index) return
    let on = true
    loadItems().then((i) => on && setIndex(i))
    return () => {
      on = false
    }
  }, [enabled, index])
  return index
}

/** One-line summary: type · scale · price · availability. */
export function itemSummary(item: Item): string {
  return [
    item.type,
    item.scale && `${item.scale} scale`,
    item.credits != null && `${fmt(item.credits)} Cr`,
    item.availability != null && `availability ${item.availability}${item.restricted ? `, ${item.restricted}` : ''}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

interface PickerProps {
  value: string
  onChange: (text: string) => void
  /** Offer only items Reverse Engineering may copy (availability 2 or less, or unrated). */
  commonOnly?: boolean
  /** Called when a suggestion is chosen; the parent decides what to do with scale and price. */
  onPick: (item: Item) => void
  items?: ItemIndex
  placeholder?: string
}

/** Free-text item name with D6 Holocron suggestions. Typing anything else is still allowed. */
export function ItemPicker({ value, onChange, commonOnly = false, onPick, items, placeholder }: PickerProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const matches = useMemo(() => (items && open ? searchItems(value, 8, commonOnly ? items.common : items.items) : []), [items, open, value, commonOnly])

  function pick(item: Item) {
    onPick(item)
    setOpen(false)
  }

  return (
    <div className="picker">
      <input
        placeholder={placeholder}
        value={value}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!matches.length) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(matches[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul className="suggestions" role="listbox">
          {matches.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault() // keep focus in the input so blur does not close the list first
                pick(m)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <strong>{m.name}</strong>
              {m.model && m.model !== m.name && <span className="muted small"> {m.model}</span>}
              <div className="muted small">{itemSummary(m)}</div>
            </li>
          ))}
        </ul>
      )}
      {items === undefined && value.trim() && <div className="muted small">Loading the D6 Holocron item list…</div>}
    </div>
  )
}

/** The stat block of one item as a key/value table, with a link to its wiki page. */
export function ItemCard({ itemId, items, onClose }: { itemId: string; items?: ItemIndex; onClose: () => void }) {
  const item = items?.byId.get(itemId)
  const [stats, setStats] = useState<ItemStats | null>()
  useEffect(() => {
    let on = true
    setStats(undefined)
    loadItemStats(itemId).then((s) => on && setStats(s ?? null))
    return () => {
      on = false
    }
  }, [itemId])

  if (!items) return <p className="muted small">Loading the D6 Holocron item list…</p>
  if (!item) {
    return (
      <div className="card inner itemcard">
        <p className="muted small">
          This item is no longer in the snapshot. <button onClick={onClose}>close</button>
        </p>
      </div>
    )
  }
  const warning = blueprintWarning(item)
  return (
    <div className="card inner itemcard">
      <h4>
        {item.name} <button onClick={onClose}>close</button>
      </h4>
      <p className="muted small">{[item.model, itemSummary(item)].filter(Boolean).join(' · ')}</p>
      {warning && <p className="small neg">{warning}</p>}
      {stats === undefined ? (
        <p className="muted small">Loading stats…</p>
      ) : stats === null ? (
        <p className="muted small">No stat lines in the snapshot; see the wiki page.</p>
      ) : (
        <table className="kv">
          <tbody>
            {stats.stats.map(([k, v], i) => (
              <tr key={i}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small">
        <a href={itemUrl(item)} target="_blank" rel="noopener noreferrer">
          Open on D6 Holocron ↗
        </a>
        {stats && <span className="muted"> · wiki revision of {stats.updated} · snapshot {items.fetched}</span>}
      </p>
    </div>
  )
}
