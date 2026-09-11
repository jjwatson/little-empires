import { forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation } from 'd3-force'
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import { HUB_ID, seedPositions } from './researchGraphModel'
import type { GraphModel, GraphNode, LinkKind, Point } from './researchGraphModel'

/**
 * Force configuration shared by the Graph view and the offline layout
 * optimiser (scripts/layout-research.ts). No React or DOM.
 */

export interface SimNode extends SimulationNodeDatum, GraphNode {}
export interface SimLink extends SimulationLinkDatum<SimNode> {
  kind: LinkKind
  /** Joins two different fields; kept loose so spokes stay intact. */
  cross: boolean
}

export const RING_GAP = 128
export const NODE_R = 12
export const HUB_R = 24

/** Baked positions: advance id -> [x, y]. The hub is implicit at the origin. */
export type LayoutPositions = Record<string, [number, number]>

/**
 * Simulation nodes for the model. Nodes with a baked position start pinned
 * there (fx/fy); the rest start on their seed ring so the forces can place them.
 */
export function buildSimNodes(model: GraphModel, baked: LayoutPositions = {}): SimNode[] {
  const seed = seedPositions(model, RING_GAP)
  return model.nodes.map((n) => {
    const b = baked[n.id]
    const p: Point = b ? { x: b[0], y: b[1] } : seed.get(n.id)!
    const node: SimNode = { ...n, x: p.x, y: p.y, vx: 0, vy: 0 }
    if (n.id === HUB_ID || b) {
      node.fx = p.x
      node.fy = p.y
    }
    return node
  })
}

export function buildSimLinks(model: GraphModel, nodes: SimNode[]): SimLink[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return model.links.map((l) => {
    const source = byId.get(l.source)!
    const target = byId.get(l.target)!
    return { source, target, kind: l.kind, cross: source.depth > 0 && source.field !== target.field }
  })
}

/** Pulls each node's polar angle toward its field's wedge centre so fields form spokes. */
export function forceWedge(model: GraphModel, strength: number, freeFields: ReadonlySet<string> = new Set()) {
  let nodes: SimNode[] = []
  const force = (alpha: number) => {
    for (const n of nodes) {
      if (n.depth === 0 || n.fx != null || freeFields.has(n.field)) continue
      const target = model.fieldAngle.get(n.field)
      if (target == null) continue
      const x = n.x ?? 0
      const y = n.y ?? 0
      const r = Math.hypot(x, y) || 1
      const a = Math.atan2(y, x)
      const d = Math.atan2(Math.sin(target - a), Math.cos(target - a))
      const k = strength * alpha * d
      n.vx = (n.vx ?? 0) - Math.sin(a) * r * k
      n.vy = (n.vy ?? 0) + Math.cos(a) * r * k
    }
  }
  force.initialize = (ns: SimNode[]) => {
    nodes = ns
  }
  return force
}

export interface SimulationOptions {
  /** Fields whose nodes are not pulled into a wedge (e.g. Research when it rings the hub). */
  freeFields?: ReadonlySet<string>
  linkStrength?: (l: SimLink) => number
}

export const defaultLinkStrength = (l: SimLink): number =>
  l.kind === 'start' ? 0.5 : l.cross ? 0.1 : l.kind === 'gate' ? 0.15 : l.kind === 'any' ? 0.25 : 0.3

/** The radial spoke layout. Created stopped; callers restart or tick it. */
export function makeSimulation(model: GraphModel, nodes: SimNode[], links: SimLink[], opts: SimulationOptions = {}): Simulation<SimNode, SimLink> {
  return forceSimulation<SimNode, SimLink>(nodes)
    .force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance(RING_GAP * 0.9)
        .strength(opts.linkStrength ?? defaultLinkStrength),
    )
    .force('charge', forceManyBody<SimNode>().strength(-90).distanceMax(220))
    .force('collide', forceCollide<SimNode>((d) => (d.depth === 0 ? HUB_R : NODE_R) + 10).strength(0.9))
    .force('radial', forceRadial<SimNode>((d) => d.depth * RING_GAP, 0, 0).strength(0.9))
    .force('wedge', forceWedge(model, 0.3, opts.freeFields))
    .alphaDecay(0.035)
    .velocityDecay(0.45)
    .stop()
}

/** Run a stopped simulation to rest synchronously. Returns the tick count. */
export function settle(sim: Simulation<SimNode, SimLink>): number {
  let ticks = 0
  while (sim.alpha() > sim.alphaMin()) {
    sim.tick()
    ticks++
  }
  return ticks
}

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

/** Do the two straight segments cross (excluding shared endpoints)? */
export function segmentsCross(a: SimNode, b: SimNode, c: SimNode, d: SimNode): boolean {
  if (a === c || a === d || b === c || b === d) return false
  const ax = a.x!, ay = a.y!, bx = b.x!, by = b.y!, cx = c.x!, cy = c.y!, dx = d.x!, dy = d.y!
  const o1 = orient(ax, ay, bx, by, cx, cy)
  const o2 = orient(ax, ay, bx, by, dx, dy)
  const o3 = orient(cx, cy, dx, dy, ax, ay)
  const o4 = orient(cx, cy, dx, dy, bx, by)
  return o1 * o2 < 0 && o3 * o4 < 0
}

/** Number of link pairs whose straight segments cross. */
export function countCrossings(links: readonly SimLink[]): number {
  let n = 0
  for (let i = 0; i < links.length; i++) {
    const a = links[i].source as SimNode
    const b = links[i].target as SimNode
    for (let j = i + 1; j < links.length; j++) {
      if (segmentsCross(a, b, links[j].source as SimNode, links[j].target as SimNode)) n++
    }
  }
  return n
}

/** Smallest centre-to-centre distance between any two nodes. */
export function minDistance(nodes: readonly SimNode[]): number {
  let m = Infinity
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      m = Math.min(m, Math.hypot(nodes[i].x! - nodes[j].x!, nodes[i].y! - nodes[j].y!))
    }
  }
  return m
}

/** Current positions as the baked JSON shape (hub omitted), integers, sorted by id. */
export function toLayoutPositions(nodes: readonly SimNode[]): LayoutPositions {
  const out: LayoutPositions = {}
  for (const n of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (n.id === HUB_ID) continue
    out[n.id] = [Math.round(n.x ?? 0), Math.round(n.y ?? 0)]
  }
  return out
}

/** One entry per line so diffs stay readable. */
export function formatLayout(positions: LayoutPositions): string {
  const lines = Object.entries(positions).map(([id, [x, y]]) => `  ${JSON.stringify(id)}: [${x}, ${y}]`)
  return `{\n${lines.join(',\n')}\n}\n`
}

// ---------------------------------------------------------------------------
// Label geometry. Labels are 11px text whose box we estimate from the length;
// the renderer picks the side of the node that clashes least, and the offline
// optimiser scores the same boxes so it can move nodes to make room.

export type LabelSide = 'below' | 'above' | 'right' | 'left'
export const LABEL_SIDES: readonly LabelSide[] = ['below', 'above', 'right', 'left']
export const LABEL_H = 14
export const LABEL_GAP = 4
const CHAR_W = 6.2
const LABEL_MAX_CHARS = 22

export interface Box {
  x1: number
  y1: number
  x2: number
  y2: number
}

export const nodeRadius = (n: GraphNode): number => (n.depth === 0 ? HUB_R : NODE_R)

export function labelWidth(n: GraphNode): number {
  const chars = Math.min(n.label.length, LABEL_MAX_CHARS)
  return chars * CHAR_W + 4
}

/** Bounding box of a node's label on the given side, in graph units. */
export function labelBox(n: SimNode, side: LabelSide): Box {
  const x = n.x ?? 0
  const y = n.y ?? 0
  const r = nodeRadius(n)
  const w = labelWidth(n)
  const h = LABEL_H
  switch (side) {
    case 'below':
      return { x1: x - w / 2, y1: y + r + LABEL_GAP, x2: x + w / 2, y2: y + r + LABEL_GAP + h }
    case 'above':
      return { x1: x - w / 2, y1: y - r - LABEL_GAP - h, x2: x + w / 2, y2: y - r - LABEL_GAP }
    case 'right':
      return { x1: x + r + LABEL_GAP, y1: y - h / 2, x2: x + r + LABEL_GAP + w, y2: y + h / 2 }
    case 'left':
      return { x1: x - r - LABEL_GAP - w, y1: y - h / 2, x2: x - r - LABEL_GAP, y2: y + h / 2 }
  }
}

export function nodeBox(n: SimNode): Box {
  const r = nodeRadius(n)
  return { x1: n.x! - r, y1: n.y! - r, x2: n.x! + r, y2: n.y! + r }
}

export const boxesOverlap = (a: Box, b: Box): boolean => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2

/** Liang–Barsky: does the segment pass through the box? */
export function segmentHitsBox(ax: number, ay: number, bx: number, by: number, box: Box): boolean {
  let t0 = 0
  let t1 = 1
  const dx = bx - ax
  const dy = by - ay
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
    return true
  }
  return clip(-dx, ax - box.x1) && clip(dx, box.x2 - ax) && clip(-dy, ay - box.y1) && clip(dy, box.y2 - ay)
}

export const LABEL_WEIGHTS = { labelLabel: 2, labelNode: 3, labelLine: 1 }

/**
 * Cost of placing node n's label on `side`, given the other nodes' current
 * sides (nodes missing from `sides` are ignored as labels). Own links count:
 * a label should sit away from the lines leaving its node.
 */
export function labelCost(
  n: SimNode,
  side: LabelSide,
  nodes: readonly SimNode[],
  links: readonly SimLink[],
  sides: ReadonlyMap<string, LabelSide>,
): number {
  const box = labelBox(n, side)
  let cost = 0
  for (const m of nodes) {
    if (m === n) continue
    if (boxesOverlap(box, nodeBox(m))) cost += LABEL_WEIGHTS.labelNode
    const ms = sides.get(m.id)
    if (ms && boxesOverlap(box, labelBox(m, ms))) cost += LABEL_WEIGHTS.labelLabel
  }
  for (const l of links) {
    const s = l.source as SimNode
    const t = l.target as SimNode
    if (segmentHitsBox(s.x!, s.y!, t.x!, t.y!, box)) cost += LABEL_WEIGHTS.labelLine
  }
  return cost
}

/** Greedy side choice, inner rings first so the dense centre settles first. Hub is always below. */
export function pickLabelSides(nodes: readonly SimNode[], links: readonly SimLink[]): Map<string, LabelSide> {
  const sides = new Map<string, LabelSide>()
  const order = [...nodes].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
  for (const n of order) {
    if (n.depth === 0) {
      sides.set(n.id, 'below')
      continue
    }
    let best: LabelSide = 'below'
    let bestCost = Infinity
    for (const side of LABEL_SIDES) {
      const c = labelCost(n, side, nodes, links, sides)
      if (c < bestCost) {
        bestCost = c
        best = side
      }
      if (c === 0) break
    }
    sides.set(n.id, best)
  }
  return sides
}

/** Total label clash penalty for a layout with the given sides. */
export function labelPenalty(nodes: readonly SimNode[], links: readonly SimLink[], sides: ReadonlyMap<string, LabelSide>): number {
  let total = 0
  const boxes = nodes.filter((n) => n.depth > 0).map((n) => ({ n, box: labelBox(n, sides.get(n.id) ?? 'below') }))
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) if (boxesOverlap(boxes[i].box, boxes[j].box)) total += LABEL_WEIGHTS.labelLabel
    for (const m of nodes) if (m !== boxes[i].n && boxesOverlap(boxes[i].box, nodeBox(m))) total += LABEL_WEIGHTS.labelNode
    for (const l of links) {
      const s = l.source as SimNode
      const t = l.target as SimNode
      if (segmentHitsBox(s.x!, s.y!, t.x!, t.y!, boxes[i].box)) total += LABEL_WEIGHTS.labelLine
    }
  }
  return total
}

/**
 * Where to draw a field's caption, derived from where its nodes actually are so
 * it follows any layout (spokes, a ring around the hub, or hand-dragged nodes).
 */
export function fieldLabelPosition(field: string, nodes: readonly SimNode[]): Point {
  const own = nodes.filter((n) => n.field === field && n.depth > 0)
  if (!own.length) return { x: 0, y: 0 }
  let sx = 0
  let sy = 0
  let maxR = 0
  let minR = Infinity
  for (const n of own) {
    const r = Math.hypot(n.x!, n.y!) || 1
    sx += n.x! / r
    sy += n.y! / r
    maxR = Math.max(maxR, r)
    minR = Math.min(minR, r)
  }
  const spread = Math.hypot(sx, sy) / own.length // 1 = all one direction, 0 = all around
  if (spread < 0.35) {
    // The field encircles the centre: caption just above the hub, inside its innermost ring.
    return { x: 0, y: -Math.max(HUB_R + 36, minR - RING_GAP * 0.5) }
  }
  const angle = Math.atan2(sy, sx)
  const r = maxR + RING_GAP * 0.6
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) }
}
