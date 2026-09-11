/**
 * Offline optimiser for the research graph layout.
 *
 *   npx vite-node scripts/layout-research.ts [--seeds 8] [--rounds 8] [--keep] [--mode spokes|centre]
 *
 * Modes: `spokes` (default) gives every field a wedge, Research at 12 o'clock.
 * `centre` rings the hub with the Research advances and orders the other
 * fields' wedges so each sits beside the Research advance that unlocks it.
 *
 * Settles the shared force layout, then lowers a score = link crossings +
 * label clashes (label/label, label/node, label/line) while keeping the
 * ring-and-spoke structure: swaps nodes that share a field and depth, nudges
 * nodes angularly inside their wedge and a little radially, and keeps the
 * best of several seeds. Writes src/data/researchLayout.json.
 * With --keep, starts from the existing JSON instead of a fresh settle
 * (useful after hand-tuning: keeps positions, only tidies clashes).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { ADVANCES } from '../src/data'
import { buildGraphModel } from '../src/ui/researchGraphModel'
import {
  NODE_R,
  RING_GAP,
  buildSimLinks,
  buildSimNodes,
  countCrossings,
  formatLayout,
  labelBox,
  labelPenalty,
  boxesOverlap,
  nodeBox,
  makeSimulation,
  minDistance,
  pickLabelSides,
  segmentHitsBox,
  segmentsCross,
  settle,
  toLayoutPositions,
  LABEL_WEIGHTS,
} from '../src/ui/researchGraphForces'
import type { LabelSide, LayoutPositions, SimLink, SimNode } from '../src/ui/researchGraphForces'
import type { GraphModel, Wedge } from '../src/ui/researchGraphModel'

const OUT = new URL('../src/data/researchLayout.json', import.meta.url)
const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : def
}
const SEEDS = arg('seeds', 8)
const ROUNDS = arg('rounds', 8)
const KEEP = process.argv.includes('--keep')
const modeIdx = process.argv.indexOf('--mode')
const MODE = modeIdx >= 0 ? process.argv[modeIdx + 1] : 'spokes'
if (MODE !== 'spokes' && MODE !== 'centre') throw new Error(`unknown --mode ${MODE}`)
const CENTRE_FIELD = 'Research'

const baseModel = buildGraphModel(ADVANCES)
const model: GraphModel = MODE === 'centre' ? centreModel(baseModel) : baseModel
const FREE_FIELDS: ReadonlySet<string> = new Set(MODE === 'centre' ? [CENTRE_FIELD] : [])

/**
 * Centre mode: Research gets the whole circle; the other fields are laid out
 * around it in an order that keeps fields sharing a gate advance adjacent and
 * shortens the remaining cross-field links.
 */
function centreModel(m: GraphModel): GraphModel {
  const others = m.fields.filter((f) => f !== CENTRE_FIELD)
  const count = new Map(others.map((f) => [f, m.nodes.filter((n) => n.field === f).length]))
  // Gate = the Research advance with most links into the field.
  const gate = new Map<string, string>()
  for (const f of others) {
    const tally = new Map<string, number>()
    for (const l of m.links) {
      const s = m.nodeById.get(l.source)!
      const t = m.nodeById.get(l.target)!
      if (t.field === f && s.field === CENTRE_FIELD) tally.set(s.id, (tally.get(s.id) ?? 0) + 1)
    }
    gate.set(f, [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '')
  }
  // Affinity between fields: shared gate + direct links between them.
  const w = (a: string, b: string): number => {
    let v = gate.get(a) && gate.get(a) === gate.get(b) ? 4 : 0
    for (const l of m.links) {
      const s = m.nodeById.get(l.source)!.field
      const t = m.nodeById.get(l.target)!.field
      if ((s === a && t === b) || (s === b && t === a)) v++
    }
    return v
  }
  const W = new Map<string, number>()
  for (const a of others) for (const b of others) if (a < b) W.set(`${a}|${b}`, w(a, b))
  const aff = (a: string, b: string) => W.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? 0

  const total = others.reduce((s, f) => s + count.get(f)!, 0)
  const cost = (order: string[]): number => {
    const centre = new Map<string, number>()
    let cursor = 0
    for (const f of order) {
      const width = (2 * Math.PI * count.get(f)!) / total
      centre.set(f, cursor + width / 2)
      cursor += width
    }
    let c = 0
    for (const a of others) {
      for (const b of others) {
        if (a >= b) continue
        const d = Math.abs(centre.get(a)! - centre.get(b)!)
        c += aff(a, b) * Math.min(d, 2 * Math.PI - d)
      }
    }
    return c
  }
  // Greedy chain, then adjacent swaps and single moves until no improvement.
  let order: string[] = [others.slice().sort((a, b) => count.get(b)! - count.get(a)!)[0]]
  const left = new Set(others.filter((f) => f !== order[0]))
  while (left.size) {
    let best = ''
    let bestV = -1
    let atEnd = true
    for (const f of left) {
      const vEnd = aff(order[order.length - 1], f)
      const vStart = aff(order[0], f)
      if (vEnd > bestV) (bestV = vEnd), (best = f), (atEnd = true)
      if (vStart > bestV) (bestV = vStart), (best = f), (atEnd = false)
    }
    if (atEnd) order.push(best)
    else order.unshift(best)
    left.delete(best)
  }
  let improved = true
  let bestCost = cost(order)
  while (improved) {
    improved = false
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        if (i === j) continue
        const trial = order.slice()
        const [f] = trial.splice(i, 1)
        trial.splice(j, 0, f)
        const c = cost(trial)
        if (c < bestCost - 1e-9) {
          bestCost = c
          order = trial
          improved = true
        }
      }
    }
  }

  const fieldWedge = new Map<string, Wedge>()
  const fieldAngle = new Map<string, number>()
  let cursor = -Math.PI / 2
  for (const f of order) {
    const width = (2 * Math.PI * count.get(f)!) / total
    fieldWedge.set(f, { start: cursor, end: cursor + width, center: cursor + width / 2 })
    fieldAngle.set(f, cursor + width / 2)
    cursor += width
  }
  fieldWedge.set(CENTRE_FIELD, { start: -Math.PI, end: Math.PI, center: 0 })
  fieldAngle.set(CENTRE_FIELD, 0)
  console.log(`centre mode: field order ${order.join(' > ')}`)
  console.log(`gates: ${others.map((f) => `${f}<-${gate.get(f)}`).join(', ')}`)
  return { ...m, fieldWedge, fieldAngle }
}

/**
 * Centre mode seeding: Research advances start at the angle of the fields they
 * unlock (or their Research parent's angle), on their depth ring.
 */
function seedCentreField(nodes: SimNode[]) {
  const research = nodes.filter((n) => n.field === CENTRE_FIELD).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const angleOf = (n: SimNode) => Math.atan2(n.y!, n.x!)
  const mean = (angles: number[]) => Math.atan2(angles.reduce((s, a) => s + Math.sin(a), 0), angles.reduce((s, a) => s + Math.cos(a), 0))
  const placed = new Set<string>()
  research.forEach((n, i) => {
    const gated = (model.succs.get(n.id) ?? []).map((id) => byId.get(id)!).filter((m) => m.field !== CENTRE_FIELD)
    const parents = (model.preds.get(n.id) ?? []).map((id) => byId.get(id)!).filter((m) => m.field === CENTRE_FIELD && placed.has(m.id))
    let angle: number
    if (gated.length) angle = mean(gated.map((m) => model.fieldAngle.get(m.field)!))
    else if (parents.length) angle = mean(parents.map(angleOf)) + ((i % 3) - 1) * 0.35
    else angle = -Math.PI / 2 + (i * 2 * Math.PI) / research.length
    const r = n.depth * RING_GAP
    n.x = r * Math.cos(angle)
    n.y = r * Math.sin(angle)
    placed.add(n.id)
  })
}

const linkStrength = (l: SimLink): number => {
  const s = l.source as SimNode
  if (MODE === 'centre' && s.field === CENTRE_FIELD && l.cross) return 0.35
  return l.kind === 'start' ? 0.5 : l.cross ? 0.1 : l.kind === 'gate' ? 0.15 : l.kind === 'any' ? 0.25 : 0.3
}
const MIN_GAP = 2 * NODE_R + 6
const RADIAL_SLACK = 26

function unpinAll(nodes: SimNode[]) {
  for (const n of nodes) if (n.depth > 0) (n.fx = undefined), (n.fy = undefined)
}

function cellsOf(nodes: SimNode[]): SimNode[][] {
  const cells = new Map<string, SimNode[]>()
  for (const n of nodes) {
    if (n.depth === 0) continue
    const k = `${n.field}|${n.depth}`
    cells.set(k, [...(cells.get(k) ?? []), n])
  }
  return [...cells.values()]
}

/** Rotate the in-cell seed order so each seed starts from a different arrangement. */
function rotateCells(nodes: SimNode[], seed: number) {
  for (const cell of cellsOf(nodes)) {
    if (cell.length < 2) continue
    const pos = cell.map((n) => [n.x!, n.y!] as const)
    cell.forEach((n, i) => {
      const p = pos[(i + seed) % cell.length]
      n.x = p[0]
      n.y = p[1]
    })
  }
}

function incidentTo(links: SimLink[], ...ns: SimNode[]): Set<number> {
  const set = new Set(ns)
  const out = new Set<number>()
  links.forEach((l, i) => {
    if (set.has(l.source as SimNode) || set.has(l.target as SimNode)) out.add(i)
  })
  return out
}

/** Crossings involving any link incident to the given nodes (each pair counted once). */
function incidentCrossings(links: SimLink[], incident: Set<number>): number {
  let c = 0
  for (const i of incident) {
    const a = links[i].source as SimNode
    const b = links[i].target as SimNode
    for (let j = 0; j < links.length; j++) {
      if (j === i || (incident.has(j) && j < i)) continue
      if (segmentsCross(a, b, links[j].source as SimNode, links[j].target as SimNode)) c++
    }
  }
  return c
}

/**
 * Label clashes that involve the given nodes: their labels against everything,
 * their circles against other labels, and their links against other labels.
 */
function localLabelPenalty(nodes: SimNode[], links: SimLink[], incident: Set<number>, sides: Map<string, LabelSide>, ...ns: SimNode[]): number {
  const set = new Set(ns)
  let c = 0
  for (const n of ns) {
    const box = labelBox(n, sides.get(n.id) ?? 'below')
    const circle = nodeBox(n)
    for (const m of nodes) {
      if (m === n) continue
      if (boxesOverlap(box, nodeBox(m))) c += LABEL_WEIGHTS.labelNode
      if (m.depth > 0) {
        const mb = labelBox(m, sides.get(m.id) ?? 'below')
        // label/label pairs inside `ns` are counted once
        if (!set.has(m) || m.id > n.id) if (boxesOverlap(box, mb)) c += LABEL_WEIGHTS.labelLabel
        if (!set.has(m) && boxesOverlap(circle, mb)) c += LABEL_WEIGHTS.labelNode
      }
    }
    for (let i = 0; i < links.length; i++) {
      const s = links[i].source as SimNode
      const t = links[i].target as SimNode
      if (segmentHitsBox(s.x!, s.y!, t.x!, t.y!, box)) c += LABEL_WEIGHTS.labelLine
    }
  }
  for (const i of incident) {
    const s = links[i].source as SimNode
    const t = links[i].target as SimNode
    for (const m of nodes) {
      if (set.has(m) || m.depth === 0) continue
      if (segmentHitsBox(s.x!, s.y!, t.x!, t.y!, labelBox(m, sides.get(m.id) ?? 'below'))) c += LABEL_WEIGHTS.labelLine
    }
  }
  return c
}

function localScore(nodes: SimNode[], links: SimLink[], sides: Map<string, LabelSide>, ...ns: SimNode[]): number {
  const inc = incidentTo(links, ...ns)
  return incidentCrossings(links, inc) + localLabelPenalty(nodes, links, inc, sides, ...ns)
}

function tooClose(nodes: SimNode[], n: SimNode): boolean {
  for (const m of nodes) if (m !== n && Math.hypot(m.x! - n.x!, m.y! - n.y!) < MIN_GAP) return true
  return false
}

const totalScore = (nodes: SimNode[], links: SimLink[], sides: Map<string, LabelSide>) => countCrossings(links) + labelPenalty(nodes, links, sides)

/** Accept-if-better local search that keeps rings and wedges. Returns the final score. */
function improve(nodes: SimNode[], links: SimLink[], rounds: number): { score: number; sides: Map<string, LabelSide> } {
  let sides = pickLabelSides(nodes, links)
  let score = totalScore(nodes, links, sides)
  const cells = cellsOf(nodes)
  for (let round = 0; round < rounds; round++) {
    const roundStart = score
    // 1. Swap positions of nodes in the same field × depth cell.
    for (const cell of cells) {
      for (let i = 0; i < cell.length; i++) {
        for (let j = i + 1; j < cell.length; j++) {
          const a = cell[i], b = cell[j]
          const before = localScore(nodes, links, sides, a, b)
          const ax = a.x!, ay = a.y!
          a.x = b.x; a.y = b.y; b.x = ax; b.y = ay
          const after = localScore(nodes, links, sides, a, b)
          if (after < before) score -= before - after
          else { b.x = a.x; b.y = a.y; a.x = ax; a.y = ay }
        }
      }
    }
    // 2. Angular nudges inside the wedge and small radial moves near the ring.
    for (const n of nodes) {
      if (n.depth === 0) continue
      const w = model.fieldWedge.get(n.field)!
      const ring = n.depth * RING_GAP
      const before = localScore(nodes, links, sides, n)
      const ox = n.x!, oy = n.y!
      const r0 = Math.hypot(ox, oy)
      const a0 = Math.atan2(oy, ox)
      const candidates: [number, number][] = []
      for (const deg of [-6, 6, -3, 3, -1.5, 1.5]) candidates.push([r0, a0 + (deg * Math.PI) / 180])
      for (const dr of [-12, 12, -6, 6]) candidates.push([r0 + dr, a0])
      for (const [r, a] of candidates) {
        if (Math.abs(r - ring) > RADIAL_SLACK) continue
        const rel = Math.atan2(Math.sin(a - w.center), Math.cos(a - w.center))
        if (Math.abs(rel) > (w.end - w.start) / 2) continue
        n.x = r * Math.cos(a); n.y = r * Math.sin(a)
        const after = localScore(nodes, links, sides, n)
        if (after < before && !tooClose(nodes, n)) { score -= before - after; break }
        n.x = ox; n.y = oy
      }
    }
    // Re-pick label sides for the new positions; keep whichever scores better.
    const newSides = pickLabelSides(nodes, links)
    const rescored = totalScore(nodes, links, newSides)
    if (rescored <= score) { sides = newSides; score = rescored }
    else score = totalScore(nodes, links, sides)
    if (score >= roundStart) break
  }
  return { score, sides }
}

let bestScore = Infinity
let bestLayout: LayoutPositions | null = null
let bestStats = ''

const existing: LayoutPositions | null = KEEP ? JSON.parse(readFileSync(OUT, 'utf8')) : null

for (let seed = 0; seed < (KEEP ? 1 : SEEDS); seed++) {
  const nodes = buildSimNodes(model, existing ?? {})
  const links = buildSimLinks(model, nodes)
  unpinAll(nodes)
  const sim = makeSimulation(model, nodes, links, { freeFields: FREE_FIELDS, linkStrength })
  if (!existing) {
    if (MODE === 'centre') seedCentreField(nodes)
    rotateCells(nodes, seed)
    settle(sim)
  }
  const startSides = pickLabelSides(nodes, links)
  const startCross = countCrossings(links)
  const startLabels = labelPenalty(nodes, links, startSides)
  const { score, sides } = improve(nodes, links, ROUNDS)
  const cross = countCrossings(links)
  const labels = labelPenalty(nodes, links, sides)
  const dist = minDistance(nodes)
  const penalised = score + (dist < MIN_GAP ? 1000 : 0)
  console.log(
    `seed ${seed}: crossings ${startCross} -> ${cross}, label clashes ${startLabels} -> ${labels}, score ${startCross + startLabels} -> ${score}, min distance ${dist.toFixed(1)}`,
  )
  if (penalised < bestScore) {
    bestScore = penalised
    bestLayout = toLayoutPositions(nodes)
    bestStats = `crossings ${cross}, label clashes ${labels}, min distance ${dist.toFixed(1)}`
  }
}

writeFileSync(OUT, formatLayout(bestLayout!))
console.log(`wrote ${Object.keys(bestLayout!).length} positions to src/data/researchLayout.json (${bestStats})`)
