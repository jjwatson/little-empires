import type { Advance } from '../data'

/**
 * Pure graph model behind the radial research view: nodes, links, depth rings
 * and per-field wedge angles. No React, DOM or d3 so it can be unit tested.
 */

export const HUB_ID = '__hub__'

export type LinkKind = 'all' | 'any' | 'gate' | 'start'

export interface GraphNode {
  id: string
  label: string
  field: string
  tier: number
  /** Longest prerequisite chain back to the hub; hub = 0, start advances = 1. */
  depth: number
  advance?: Advance
}

export interface GraphLink {
  source: string
  target: string
  kind: LinkKind
}

export interface Wedge {
  start: number
  end: number
  center: number
}

export interface GraphModel {
  nodes: GraphNode[]
  nodeById: Map<string, GraphNode>
  links: GraphLink[]
  /** id -> prerequisite ids (all, any, gate and start links). */
  preds: Map<string, string[]>
  succs: Map<string, string[]>
  maxDepth: number
  fields: string[]
  /** Angular wedge per field, radians, -PI/2 is 12 o'clock. */
  fieldWedge: Map<string, Wedge>
  fieldAngle: Map<string, number>
}

/**
 * The advance that opens this one's tier in its own field, if the field has
 * tier gates at or below that tier. Mirrors `tierOpen` in model/prereqs.ts.
 */
export function tierGateFor(a: Advance, advances: readonly Advance[]): Advance | undefined {
  let best: Advance | undefined
  for (const g of advances) {
    if (g.field !== a.field || g.id === a.id || !g.unlocksTier || g.unlocksTier > a.tier) continue
    if (!best || g.unlocksTier > best.unlocksTier! || (g.unlocksTier === best.unlocksTier && g.tier < best.tier)) best = g
  }
  return best
}

export function buildGraphModel(advances: readonly Advance[]): GraphModel {
  const byId = new Map(advances.map((a) => [a.id, a]))
  const links: GraphLink[] = []
  const preds = new Map<string, string[]>()
  const succs = new Map<string, string[]>()
  const addLink = (source: string, target: string, kind: LinkKind) => {
    links.push({ source, target, kind })
    preds.set(target, [...(preds.get(target) ?? []), source])
    succs.set(source, [...(succs.get(source) ?? []), target])
  }

  for (const a of advances) {
    const explicit = [...(a.prereq.all ?? []), ...(a.prereq.any ?? [])].filter((id) => byId.has(id))
    for (const id of a.prereq.all ?? []) if (byId.has(id)) addLink(id, a.id, 'all')
    for (const id of a.prereq.any ?? []) if (byId.has(id)) addLink(id, a.id, 'any')
    if (explicit.length === 0) {
      const gate = tierGateFor(a, advances)
      if (gate) addLink(gate.id, a.id, 'gate')
    }
  }
  for (const a of advances) if (!preds.has(a.id)) addLink(HUB_ID, a.id, 'start')

  // Longest-path depth (Kahn's algorithm). Unreachable nodes (cycles) fall back to tier.
  const depth = new Map<string, number>([[HUB_ID, 0]])
  const remaining = new Set(advances.map((a) => a.id))
  let progressed = true
  while (progressed && remaining.size) {
    progressed = false
    for (const id of remaining) {
      const ps = preds.get(id) ?? []
      if (ps.every((p) => depth.has(p))) {
        depth.set(id, Math.max(...ps.map((p) => depth.get(p)!)) + 1)
        remaining.delete(id)
        progressed = true
      }
    }
  }
  for (const id of remaining) depth.set(id, byId.get(id)!.tier)

  const fields = [...new Set(advances.map((a) => a.field))]
  const nodes: GraphNode[] = [
    { id: HUB_ID, label: 'Start', field: '', tier: 0, depth: 0 },
    ...advances.map((a) => ({ id: a.id, label: a.name, field: a.field, tier: a.tier, depth: depth.get(a.id)!, advance: a })),
  ]
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const maxDepth = Math.max(...nodes.map((n) => n.depth))

  // Wedges proportional to field size, in sheet order, first field centred at 12 o'clock.
  const counts = new Map(fields.map((f) => [f, advances.filter((a) => a.field === f).length]))
  const total = advances.length
  const fieldWedge = new Map<string, Wedge>()
  const fieldAngle = new Map<string, number>()
  let cursor = -Math.PI / 2 - (Math.PI * counts.get(fields[0])!) / total
  for (const f of fields) {
    const width = (2 * Math.PI * counts.get(f)!) / total
    const wedge = { start: cursor, end: cursor + width, center: cursor + width / 2 }
    fieldWedge.set(f, wedge)
    fieldAngle.set(f, wedge.center)
    cursor += width
  }

  return { nodes, nodeById, links, preds, succs, maxDepth, fields, fieldWedge, fieldAngle }
}

function closure(id: string, next: Map<string, string[]>): Set<string> {
  const out = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    for (const n of next.get(cur) ?? []) {
      if (!out.has(n)) {
        out.add(n)
        stack.push(n)
      }
    }
  }
  return out
}

/** Every prerequisite, transitively (excluding the node itself). */
export const ancestorsOf = (id: string, preds: Map<string, string[]>): Set<string> => closure(id, preds)
/** Everything that depends on the node, transitively (excluding the node itself). */
export const descendantsOf = (id: string, succs: Map<string, string[]>): Set<string> => closure(id, succs)

export interface Point {
  x: number
  y: number
}

/**
 * Deterministic starting positions: each node on its depth ring, spread evenly
 * across its field's wedge among the siblings that share field and depth.
 */
export function seedPositions(model: GraphModel, ringGap: number): Map<string, Point> {
  const groups = new Map<string, GraphNode[]>()
  for (const n of model.nodes) {
    if (n.depth === 0) continue
    const k = `${n.field}|${n.depth}`
    groups.set(k, [...(groups.get(k) ?? []), n])
  }
  const out = new Map<string, Point>([[HUB_ID, { x: 0, y: 0 }]])
  for (const group of groups.values()) {
    const wedge = model.fieldWedge.get(group[0].field)!
    const span = wedge.end - wedge.start
    group.forEach((n, i) => {
      const angle = wedge.start + (span * (i + 1)) / (group.length + 1)
      const r = n.depth * ringGap
      out.set(n.id, { x: r * Math.cos(angle), y: r * Math.sin(angle) })
    })
  }
  return out
}

export function truncateLabel(name: string, maxChars = 22): string {
  return name.length <= maxChars ? name : name.slice(0, maxChars - 1).trimEnd() + '…'
}
