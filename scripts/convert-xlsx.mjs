// One-off converter: docs/Research xlsx -> src/data/research.json + construction.json
// Run: npm run convert-data
// Hand-curated fixes live in scripts/data-overrides.mjs; the JSON output is the source of truth.
import { readFileSync, writeFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import XLSX from 'xlsx'
import { ALIASES, SKIP_SHEETS, FIELD_NAMES, NAME_FIXES, PREREQ_OVERRIDES, TIER_OVERRIDES, ID_OVERRIDES, UNLOCKS_OVERRIDES } from './data-overrides.mjs'

const xlsxFile = readdirSync('docs').find((f) => f.startsWith('Research') && f.endsWith('.xlsx'))
if (!xlsxFile) throw new Error('No Research*.xlsx in docs/')
const wb = XLSX.read(readFileSync(`docs/${xlsxFile}`), { type: 'buffer' })

const slug = (s) =>
  String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
const clean = (s) => {
  if (s == null) return ''
  let t = String(s).replace(/\s+/g, ' ').trim()
  for (const [re, rep] of NAME_FIXES) t = t.replace(re, rep)
  return t
}
const num = (v) => (v === '' || v == null ? 0 : Number(v))

function rows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
}

// ---------- research sheets ----------
const advances = []
for (const name of wb.SheetNames) {
  if (SKIP_SHEETS.includes(name)) continue
  const field = FIELD_NAMES[name] ?? name
  const rs = rows(wb.Sheets[name])
  const headerIdx = rs.findIndex((r) => clean(r[0]) === 'Advance')
  if (headerIdx < 0) throw new Error(`No header row in sheet ${name}`)

  // tier overview block: rows 1..headerIdx-1, columns 0..4 = tiers 1..5
  const tierByNorm = new Map()
  for (let i = 1; i < headerIdx; i++) {
    for (let c = 0; c < 5; c++) {
      const v = clean(rs[i][c])
      if (v) tierByNorm.set(norm(v), c + 1)
    }
  }

  for (let i = headerIdx + 1; i < rs.length; i++) {
    const r = rs[i]
    const advName = clean(r[0])
    if (!advName) continue
    const id = ID_OVERRIDES[`${field}/${advName}`] ?? slug(advName)
    const unlocksMatch = /\bUnlocks?\b[^.]*?\bTier (\d)/i.exec(clean(r[2]) + " " + clean(r[3]))
    const unlocksTier = UNLOCKS_OVERRIDES[id] ?? (unlocksMatch ? Number(unlocksMatch[1]) : undefined)
    const tier =
      TIER_OVERRIDES[id] ??
      tierByNorm.get(norm(advName)) ??
      tierByNorm.get(norm(advName.replace(/\s*(research|blueprints)$/i, ''))) ??
      null
    advances.push({
      id,
      name: advName,
      field,
      tier,
      unlocksTier,
      prereqText: clean(r[1]),
      effects: clean(r[2]),
      notes: clean(r[3]) || undefined,
      cost: { credits: num(r[4]), rawMats: num(r[5]), energy: num(r[6]), manpower: num(r[7]) },
    })
  }
}

// ---------- construction sheet ----------
const facilities = []
{
  const rs = rows(wb.Sheets['Construction'])
  const headerIdx = rs.findIndex((r) => clean(r[0]) === 'Advance')
  for (let i = headerIdx + 1; i < rs.length; i++) {
    const r = rs[i]
    const facName = clean(r[0])
    if (!facName || facName.toLowerCase() === 'totals') continue
    facilities.push({
      id: slug(facName),
      name: facName,
      prereqText: clean(r[1]),
      effects: clean(r[2]),
      notes: clean(r[3]) || undefined,
      cost: { credits: num(r[4]), rawMats: num(r[5]), energy: num(r[6]), manpower: num(r[7]) },
      buildTime: r[8] === '' ? undefined : num(r[8]),
      income: { credits: num(r[9]), rawMats: num(r[10]), energy: num(r[11]), manpower: num(r[12]) },
    })
  }
}

// ---------- prerequisite resolution ----------
const byNorm = new Map()
for (const a of advances) {
  byNorm.set(norm(a.name), a.id)
  byNorm.set(norm(a.id), a.id)
}
for (const [alias, id] of Object.entries(ALIASES)) byNorm.set(norm(alias), id)

const unresolved = []
function resolveName(raw, owner) {
  const n = norm(raw)
  if (!n) return null
  const hit =
    byNorm.get(n) ??
    byNorm.get(n.replace(/(research|blueprints|design)$/, '')) ??
    byNorm.get(n + 'research')
  if (!hit) unresolved.push({ owner, raw })
  return hit
}

const isFreeText = (t) => Boolean(t) && !/^(none|-)$/i.test(t)

function parsePrereq(text, ownerId) {
  if (PREREQ_OVERRIDES[ownerId]) return PREREQ_OVERRIDES[ownerId]
  const t = clean(text)
  if (!t || /^(none|-)$/i.test(t)) return {}
  const parts = t.split(/\s*(?:,|\band\b)\s*/i).filter(Boolean)
  const all = []
  const any = []
  for (const p of parts) {
    if (/\bor\b/i.test(p)) {
      for (const q of p.split(/\s+or\s+/i)) {
        const id = resolveName(q, ownerId)
        if (id) any.push(id)
      }
    } else {
      const id = resolveName(p, ownerId)
      if (id) all.push(id)
    }
  }
  const out = {}
  if (all.length) out.all = all
  if (any.length) out.any = any
  return out
}

for (const a of advances) {
  a.prereq = parsePrereq(a.prereqText, a.id)
  if (isFreeText(a.prereqText) && !a.prereq.all && !a.prereq.any && !a.prereq.note) a.prereq.note = a.prereqText
  delete a.prereqText
}
for (const f of facilities) {
  f.requires = parsePrereq(f.prereqText, `facility:${f.id}`)
  if (isFreeText(f.prereqText) && !f.requires.all && !f.requires.any && !f.requires.note) f.requires.note = f.prereqText
  delete f.prereqText
}

writeFileSync('src/data/research.json', JSON.stringify(advances, null, 2) + '\n')
writeFileSync('src/data/construction.json', JSON.stringify(facilities, null, 2) + '\n')

console.log(`advances: ${advances.length}, facilities: ${facilities.length}`)
const noTier = advances.filter((a) => a.tier == null)
if (noTier.length) console.log('NO TIER:', noTier.map((a) => `${a.field}/${a.id}`).join(', '))
if (unresolved.length) {
  console.log('UNRESOLVED PREREQS:')
  for (const u of unresolved) console.log(`  ${u.owner}  <-  "${u.raw}"`)
}
