// Sanity checks on src/data/*.json. Runs as part of `npm test`.
import { readFileSync } from 'node:fs'

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

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`data ok: ${advances.length} advances, ${facilities.length} facilities`)
