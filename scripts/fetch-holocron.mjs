// D6 Holocron wiki -> src/data/items.json (compact, searchable) + src/data/itemStats.json (full stat blocks).
// Run: npm run fetch-holocron            (downloads once into .cache/, then parses)
//      npm run fetch-holocron -- --refresh (downloads again)
//      npm run fetch-holocron -- --parse   (re-parses the cached download only)
// The wiki is HTTP-only, so the app cannot read it live; this snapshot is committed instead.
// Hand-curated fixes live in scripts/holocron-overrides.mjs; the JSON output is the source of truth.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { EXCLUDE_TITLES, KEY_ALIASES, SCALE_OVERRIDES } from './holocron-overrides.mjs'

const API = 'http://d6holocron.com/wiki/api.php'
const CACHE = '.cache/holocron-pages.json'
const USER_AGENT = 'LittleEmpiresColonyTracker/1.0 (https://github.com/jjwatson/little-empires; hobby RPG tool, one-off crawl)'
const args = new Set(process.argv.slice(2))

// ---------- download ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(params, attempt = 0) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = await res.json()
    if (json.error) throw new Error(`${json.error.code}: ${json.error.info}`)
    return json
  } catch (e) {
    if (attempt >= 5) throw e
    const wait = 1000 * 2 ** attempt
    console.error(`  ${e.message}; retrying in ${wait / 1000}s`)
    await sleep(wait)
    return api(params, attempt + 1)
  }
}

async function download() {
  const pages = []
  let cont = {}
  let batch = 0
  for (;;) {
    const json = await api({
      action: 'query',
      generator: 'allpages',
      gapnamespace: '0',
      gapfilterredir: 'nonredirects',
      gaplimit: '50',
      prop: 'revisions',
      rvprop: 'content|timestamp',
      ...cont,
    })
    for (const p of json.query?.pages ?? []) {
      const rev = p.revisions?.[0]
      if (rev?.content) pages.push({ pageid: p.pageid, title: p.title, updated: rev.timestamp, text: rev.content })
    }
    batch++
    if (batch % 10 === 0) console.error(`  ${pages.length} pages so far...`)
    if (!json.continue) break
    cont = json.continue
    await sleep(250)
  }
  mkdirSync('.cache', { recursive: true })
  writeFileSync(CACHE, JSON.stringify({ fetched: new Date().toISOString(), pages }))
  console.error(`downloaded ${pages.length} pages to ${CACHE}`)
}

// ---------- parse ----------

const ATTRIBUTES = ['DEXTERITY', 'KNOWLEDGE', 'MECHANICAL', 'PERCEPTION', 'STRENGTH', 'TECHNICAL']
const SCALES = ['Character', 'Droid', 'Speeder', 'Walker', 'Starfighter', 'Capital']

/** Wikitext -> plain lines, one stat per line where the page had `<br />` separators. */
function toLines(text) {
  let t = text
  t = t.replace(/\[\[(?:File|Image):[^[\]]*(?:\[\[[^[\]]*\]\][^[\]]*)*\]\]/gi, '')
  t = t.replace(/\{\{[^{}]*\}\}/g, '')
  t = t.replace(/<br\s*\/?>/gi, '\n')
  t = t.replace(/^==+\s*(.*?)\s*:?\s*==+\s*$/gm, '$1:') // "== Source: ==" headings become stat lines
  t = t.replace(/<!--[\s\S]*?-->/g, '')
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
  t = t.replace(/<[^>]+>/g, '')
  t = t.replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1')
  t = t.replace(/\[(?:https?|ftp):\/\/\S+\s+([^\]]*)\]/g, '$1').replace(/\[(?:https?|ftp):\/\/\S+\]/g, '')
  t = t.replace(/'{2,}/g, '')
  t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
  return t
    .split('\n')
    .map((l) => l.replace(/^[\s*#:;\-–•]+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const STAT_RE = /^([A-Za-z][A-Za-z0-9 .'’/()&-]{0,40}?)\s*:\s*(.*)$/
const ATTR_RE = new RegExp(`^(${ATTRIBUTES.join('|')})\\s*:?\\s*(\\d\\S*.*)$`, 'i')

function parseStats(lines) {
  const stats = []
  let attributes = 0
  let listLinks = 0
  for (const line of lines) {
    if (/^\d+\.?\s*$/.test(line)) continue
    const attr = line.match(ATTR_RE)
    if (attr) {
      attributes++
      stats.push([attr[1].toUpperCase(), attr[2].trim()])
      continue
    }
    const m = line.match(STAT_RE)
    if (!m) continue
    let key = m[1].trim().replace(/\s+/g, ' ')
    const value = m[2].trim().length > 400 ? m[2].trim().slice(0, 400) + '…' : m[2].trim()
    if (/^https?$/i.test(key)) continue
    key = KEY_ALIASES[key.toLowerCase()] ?? key
    if (/^[a-z]/.test(key)) key = key[0].toUpperCase() + key.slice(1)
    if (key.split(' ').length > 4) continue
    stats.push([key, value])
    if (stats.length >= 80) break
  }
  for (const line of lines) if (/^\[\[|\]\]$/.test(line)) listLinks++
  return { stats, attributes, listLinks }
}

const stat = (stats, key) => stats.find(([k]) => k.toLowerCase() === key)?.[1]

/** Scale words as typed on the wiki, typos included ("Chaarcter", "Speeer", "Starlighter", "Capitol"). */
const SCALE_PREFIXES = [
  ['cha', 'Character'],
  ['dro', 'Droid'],
  ['spe', 'Speeder'],
  ['airspeeder', 'Speeder'],
  ['wal', 'Walker'],
  ['starf', 'Starfighter'],
  ['starl', 'Starfighter'],
  ['cap', 'Capital'],
]
function normaliseScale(value) {
  if (!value) return null
  const v = value.toLowerCase().trim()
  for (const [prefix, scale] of SCALE_PREFIXES) if (v.startsWith(prefix)) return scale
  return null
}

function parseCost(value) {
  if (!value) return null
  if (/^(not|n\/a|none|priceless|unavailable|unknown|varies|-)/i.test(value.trim())) return null
  const m = value.match(/(\d[\d,]*(?:\.\d+)?)\s*(million|mil\b|k\b)?/i)
  if (!m) return null
  const unit = m[2]?.toLowerCase()
  const n = Number(m[1].replace(/,/g, '')) * (unit?.startsWith('mil') ? 1e6 : unit === 'k' ? 1e3 : 1)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function parseAvailability(value) {
  if (!value) return { availability: null, restricted: null }
  const num = value.match(/\d+/)
  const code = value.match(/\b([RXF])\b/i)
  return { availability: num ? Number(num[0]) : null, restricted: code ? code[1].toUpperCase() : null }
}

const slug = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function parse(pages) {
  const items = []
  const statsById = {}
  const ids = new Map()
  const skipped = { list: 0, noStats: 0, notItem: 0, excluded: 0 }
  for (const page of pages) {
    if (EXCLUDE_TITLES.has(page.title)) {
      skipped.excluded++
      continue
    }
    const lines = toLines(page.text)
    const { stats, attributes, listLinks } = parseStats(lines)
    if (stats.length < 2) {
      skipped[listLinks > 3 ? 'list' : 'noStats']++
      continue
    }
    const type = stat(stats, 'type')
    const model = stat(stats, 'model') ?? stat(stats, 'craft')
    const cost = stat(stats, 'cost')
    const scaleLine = stat(stats, 'scale')
    const isDroid = attributes >= 3 && /droid/i.test(`${page.title} ${type ?? ''} ${model ?? ''}`)
    const isItem = cost != null || scaleLine != null || ((model != null || stat(stats, 'craft') != null) && stats.length >= 4) || isDroid
    if (!isItem) {
      skipped.notItem++
      continue
    }
    let id = slug(page.title)
    if (ids.has(id)) {
      let n = 2
      while (ids.has(`${id}-${n}`)) n++
      id = `${id}-${n}`
    }
    ids.set(id, page.title)
    const scale = SCALE_OVERRIDES[page.title] ?? normaliseScale(scaleLine) ?? (isDroid ? 'Droid' : null)
    const { availability, restricted } = parseAvailability(stat(stats, 'availability'))
    // Optional fields are omitted when empty to keep the bundled list small.
    const item = { id, name: page.title }
    if (model && model.toLowerCase() !== page.title.toLowerCase()) item.model = model.slice(0, 80)
    if (type) item.type = type.slice(0, 60)
    if (scale) item.scale = scale
    const credits = parseCost(cost)
    if (credits != null) item.credits = credits
    if (availability != null) item.availability = availability
    if (restricted) item.restricted = restricted
    items.push(item)
    statsById[id] = { updated: page.updated.slice(0, 10), stats }
  }
  // Codepoint order, not locale order, so the output is identical on every machine.
  items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { items, statsById, skipped }
}

/** Stats are split into one file per leading character of the id, so a stat card loads ~1/25 of the data. */
export const shardOf = (id) => (/^[a-z]/.test(id) ? id[0] : '0')

// ---------- main ----------

if (!existsSync(CACHE) || args.has('--refresh')) {
  if (args.has('--parse')) throw new Error(`No cache at ${CACHE}; run without --parse first`)
  await download()
}
const cache = JSON.parse(readFileSync(CACHE, 'utf8'))
const { items, statsById, skipped } = parse(cache.pages)
writeFileSync('src/data/items.json', JSON.stringify({ fetched: cache.fetched.slice(0, 10), items }) + '\n')
rmSync('src/data/itemStats', { recursive: true, force: true })
mkdirSync('src/data/itemStats', { recursive: true })
const shards = {}
for (const id of Object.keys(statsById)) (shards[shardOf(id)] ??= {})[id] = statsById[id]
for (const [shard, stats] of Object.entries(shards)) writeFileSync(`src/data/itemStats/${shard}.json`, JSON.stringify(stats) + '\n')

const withScale = items.filter((i) => i.scale).length
const withCredits = items.filter((i) => i.credits != null).length
console.error(`wrote src/data/items.json and ${Object.keys(shards).length} stat shards in src/data/itemStats/`)
const byScale = Object.fromEntries(SCALES.map((s) => [s, items.filter((i) => i.scale === s).length]))
console.error(
  `parsed ${cache.pages.length} pages -> ${items.length} items (${withScale} with scale, ${withCredits} with credits); ` +
    `skipped ${JSON.stringify(skipped)}; by scale ${JSON.stringify(byScale)}`,
)
