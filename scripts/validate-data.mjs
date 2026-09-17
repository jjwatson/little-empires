// Sanity checks on src/data/*.json. Runs as part of `npm test`.
import { readFileSync, readdirSync } from 'node:fs'

const advances = JSON.parse(readFileSync('src/data/research.json', 'utf8'))
const facilities = JSON.parse(readFileSync('src/data/construction.json', 'utf8'))
const errors = []
const ids = new Set()

for (const a of advances) {
  if (ids.has(a.id)) errors.push(`duplicate advance id ${a.id}`)
  ids.add(a.id)
  if (!(a.tier >= 1 && a.tier <= 5)) errors.push(`${a.id}: bad tier ${a.tier}`)
  checkCost(a.id, a.cost)
}
const fids = new Set()
for (const f of facilities) {
  if (fids.has(f.id)) errors.push(`duplicate facility id ${f.id}`)
  fids.add(f.id)
  checkCost(f.id, f.cost)
  checkCost(f.id, f.income)
}
for (const a of advances) checkPrereq(a.id, a.prereq)
for (const f of facilities) checkPrereq(`facility:${f.id}`, f.requires)

function checkCost(owner, c) {
  for (const k of ['credits', 'rawMats', 'energy', 'manpower']) {
    if (typeof c?.[k] !== 'number' || Number.isNaN(c[k])) errors.push(`${owner}: ${k} is not a number`)
  }
}
function checkPrereq(owner, p) {
  for (const id of [...(p.all ?? []), ...(p.any ?? [])]) {
    if (!ids.has(id)) errors.push(`${owner}: unknown prerequisite ${id}`)
  }
  if (p.anyCount && !(p.any?.length >= p.anyCount)) errors.push(`${owner}: anyCount larger than any[]`)
}

// D6 Holocron snapshot (scripts/fetch-holocron.mjs)
const SCALES = ['Character', 'Droid', 'Speeder', 'Walker', 'Starfighter', 'Capital']
const { items, fetched } = JSON.parse(readFileSync('src/data/items.json', 'utf8'))
const stats = {}
for (const f of readdirSync('src/data/itemStats')) Object.assign(stats, JSON.parse(readFileSync(`src/data/itemStats/${f}`, 'utf8')))
if (!/^\d{4}-\d{2}-\d{2}$/.test(fetched)) errors.push(`items.json: bad fetched date ${fetched}`)
if (!Array.isArray(items) || items.length < 1000) errors.push(`items.json: only ${items?.length} items`)
const itemIds = new Set()
for (const i of items) {
  if (!i.id || itemIds.has(i.id)) errors.push(`duplicate or missing item id ${i.id}`)
  itemIds.add(i.id)
  if (!i.name) errors.push(`${i.id}: missing name`)
  if (i.scale !== undefined && !SCALES.includes(i.scale)) errors.push(`${i.id}: bad scale ${i.scale}`)
  if (i.credits !== undefined && !(typeof i.credits === 'number' && i.credits > 0)) errors.push(`${i.id}: bad credits ${i.credits}`)
  if (i.availability !== undefined && !(Number.isInteger(i.availability) && i.availability >= 0)) errors.push(`${i.id}: bad availability ${i.availability}`)
  if (i.restricted !== undefined && !['R', 'X', 'F'].includes(i.restricted)) errors.push(`${i.id}: bad restricted ${i.restricted}`)
  if (!Array.isArray(stats[i.id]?.stats) || stats[i.id].stats.length === 0) errors.push(`${i.id}: no stat lines`)
}
for (const id of Object.keys(stats)) if (!itemIds.has(id)) errors.push(`itemStats.json: orphan stats for ${id}`)

if (errors.length) {
  console.error(errors.slice(0, 50).join('\n') + (errors.length > 50 ? `\n...and ${errors.length - 50} more` : ''))
  process.exit(1)
}
console.log(`data ok: ${advances.length} advances, ${facilities.length} facilities, ${items.length} wiki items (snapshot ${fetched})`)
