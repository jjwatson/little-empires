import type { BlueprintScale } from './types'

/**
 * Items from the D6 Holocron wiki (http://d6holocron.com/wiki), snapshotted by
 * scripts/fetch-holocron.mjs because the wiki is HTTP-only and cannot be read from the
 * HTTPS app. `items.json` is the compact searchable list, loaded the first time a picker
 * needs it; the full stat blocks live in `itemStats/<letter>.json` and one shard is loaded
 * when a stat card is opened.
 */
export interface Item {
  id: string
  /** Wiki page title. */
  name: string
  /** Manufacturer model or craft name when it differs from the title. */
  model?: string
  type?: string
  /** Blueprint scale when the page states one (or is a droid); otherwise the player picks. */
  scale?: BlueprintScale
  /** List price in credits, when the page gives one. */
  credits?: number
  /** D6 availability number (blueprints are for 2 or less). */
  availability?: number
  /** R = restricted, X = illegal, F = fee/licence. */
  restricted?: 'R' | 'X' | 'F'
}

export interface ItemIndex {
  /** Date the snapshot was taken. */
  fetched: string
  items: readonly Item[]
  /** Items Reverse Engineering may copy: availability 2 or less, or not listed (see `isCommon`). */
  common: readonly Item[]
  byId: ReadonlyMap<string, Item>
}

export type StatLines = [string, string][]
export interface ItemStats {
  /** Date of the wiki revision the stats came from. */
  updated: string
  stats: StatLines
}

export const WIKI_BASE = 'http://d6holocron.com/wiki/index.php/'

/** Link to the item's wiki page. */
export function itemUrl(item: Pick<Item, 'name'>): string {
  return WIKI_BASE + encodeURI(item.name.replace(/ /g, '_')).replace(/\?/g, '%3F').replace(/#/g, '%23').replace(/&/g, '%26')
}

/**
 * House rule: Reverse Engineering only copies common items, availability 2 or less. Most wiki
 * pages give no availability at all, so those are offered too and flagged for the GM.
 */
export const isCommon = (item: Item): boolean => item.availability == null || item.availability <= 2

/** Soft note for items the wiki does not rate. */
export function availabilityNote(item: Item): string | undefined {
  return item.availability == null ? 'Availability is not listed on the wiki; check with the GM.' : undefined
}

/** Red warning for items the house rule would refuse (above 2, or carrying a restriction code). */
export function blueprintWarning(item: Item): string | undefined {
  const parts: string[] = []
  if (item.availability != null && item.availability > 2) parts.push(`availability ${item.availability}`)
  if (item.restricted) parts.push({ R: 'restricted', X: 'illegal', F: 'licence needed' }[item.restricted])
  return parts.length ? `Blueprints are normally for common items (availability 2 or less); this one is ${parts.join(', ')}. Check with the GM.` : undefined
}

/**
 * Case-insensitive search over name, model and type. Every word of the query must appear;
 * results rank exact title, then title prefix, then title contains, then matches elsewhere.
 */
export function searchItems(query: string, limit: number, source: readonly Item[]): Item[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const tokens = q.split(/\s+/)
  const scored: { item: Item; score: number }[] = []
  for (const item of source) {
    const name = item.name.toLowerCase()
    const hay = `${name} ${item.model ?? ''} ${item.type ?? ''}`.toLowerCase()
    if (!tokens.every((t) => hay.includes(t))) continue
    const score = name === q ? 4 : name.startsWith(q) ? 3 : name.includes(q) ? 2 : tokens.every((t) => name.includes(t)) ? 1 : 0
    scored.push({ item, score })
  }
  scored.sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length || a.item.name.localeCompare(b.item.name))
  return scored.slice(0, limit).map((s) => s.item)
}

let indexPromise: Promise<ItemIndex> | undefined

/** The searchable item list, fetched as its own chunk the first time it is needed. */
export function loadItems(): Promise<ItemIndex> {
  indexPromise ??= import('./items.json').then((m) => {
    const { fetched, items } = m.default as unknown as { fetched: string; items: Item[] }
    return { fetched, items, common: items.filter(isCommon), byId: new Map(items.map((i) => [i.id, i])) }
  })
  return indexPromise
}

const shardOf = (id: string): string => (/^[a-z]/.test(id) ? id[0] : '0')
const shardLoaders = import.meta.glob<{ default: Record<string, ItemStats> }>('./itemStats/*.json')
const shardPromises = new Map<string, Promise<Record<string, ItemStats>>>()

/** The full stat block of one item, loading only the shard that holds it. */
export async function loadItemStats(id: string): Promise<ItemStats | undefined> {
  const shard = shardOf(id)
  let p = shardPromises.get(shard)
  if (!p) {
    const loader = shardLoaders[`./itemStats/${shard}.json`]
    p = loader ? loader().then((m) => m.default) : Promise.resolve({})
    shardPromises.set(shard, p)
  }
  return (await p)[id]
}
