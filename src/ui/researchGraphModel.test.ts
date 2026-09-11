import { describe, expect, it } from 'vitest'
import { ADVANCES, ADVANCE_BY_ID, FIELDS } from '../data'
import { HUB_ID, ancestorsOf, buildGraphModel, descendantsOf, seedPositions, tierGateFor, truncateLabel } from './researchGraphModel'

const model = buildGraphModel(ADVANCES)
const prereqLinks = ADVANCES.reduce((n, a) => n + (a.prereq.all?.length ?? 0) + (a.prereq.any?.length ?? 0), 0)
const gated = ADVANCES.filter((a) => !a.prereq.all && !a.prereq.any && tierGateFor(a, ADVANCES))

describe('research graph model', () => {
  it('has one node per advance plus the hub', () => {
    expect(model.nodes).toHaveLength(ADVANCES.length + 1)
    expect(model.nodeById.get(HUB_ID)?.depth).toBe(0)
    expect(model.nodes.filter((n) => n.depth === 1).map((n) => n.id).sort()).toEqual(['higher-education', 'infrastructure-research'])
  })

  it('is fully connected: every advance has a finite depth of at least 1', () => {
    for (const n of model.nodes) if (n.id !== HUB_ID) expect(n.depth, n.id).toBeGreaterThanOrEqual(1)
    expect(model.maxDepth).toBeGreaterThan(5)
  })

  it('links every prerequisite, tier gate and start edge exactly once', () => {
    const kinds = { all: 0, any: 0, gate: 0, start: 0 }
    for (const l of model.links) {
      kinds[l.kind]++
      expect(model.nodeById.has(l.source), l.source).toBe(true)
      expect(model.nodeById.has(l.target), l.target).toBe(true)
    }
    expect(kinds.all + kinds.any).toBe(prereqLinks)
    expect(kinds.gate).toBe(gated.length)
    expect(kinds.start).toBe(2)
    expect(model.links).toHaveLength(prereqLinks + gated.length + 2)
  })

  it('marks any-links only where the target lists the source under prereq.any', () => {
    for (const l of model.links.filter((l) => l.kind === 'all' || l.kind === 'any')) {
      const target = ADVANCE_BY_ID.get(l.target)!
      expect(l.kind === 'any', `${l.source} -> ${l.target}`).toBe(target.prereq.any?.includes(l.source) ?? false)
    }
  })

  it('gates tier-locked roots from the advance that unlocks their tier in the same field', () => {
    for (const l of model.links.filter((l) => l.kind === 'gate')) {
      const src = ADVANCE_BY_ID.get(l.source)!
      const tgt = ADVANCE_BY_ID.get(l.target)!
      expect(tgt.prereq.all ?? tgt.prereq.any).toBeUndefined()
      expect(src.field).toBe(tgt.field)
      expect(src.unlocksTier!).toBeLessThanOrEqual(tgt.tier)
    }
    expect(tierGateFor(ADVANCE_BY_ID.get('terraforming')!, ADVANCES)?.id).toBe('arctic-exploitation')
    expect(tierGateFor(ADVANCE_BY_ID.get('higher-education')!, ADVANCES)).toBeUndefined()
  })

  it('assigns strictly increasing depth along every link', () => {
    for (const l of model.links) {
      expect(model.nodeById.get(l.target)!.depth, `${l.source} -> ${l.target}`).toBeGreaterThan(model.nodeById.get(l.source)!.depth)
    }
  })

  it('walks ancestors and descendants transitively', () => {
    expect([...ancestorsOf('monarchy', model.preds)].sort()).toEqual([HUB_ID, 'governmental-systems', 'higher-education'])
    expect(descendantsOf('higher-education', model.succs).has('reform')).toBe(true)
    expect(ancestorsOf(HUB_ID, model.preds).size).toBe(0)
    expect(descendantsOf(HUB_ID, model.succs).size).toBe(ADVANCES.length)
  })

  it('gives each field a wedge in sheet order that tiles the circle', () => {
    expect(model.fields).toEqual(FIELDS)
    let total = 0
    for (const f of FIELDS) {
      const w = model.fieldWedge.get(f)!
      total += w.end - w.start
      expect(model.fieldAngle.get(f)).toBeCloseTo((w.start + w.end) / 2)
    }
    expect(total).toBeCloseTo(2 * Math.PI)
    expect(model.fieldAngle.get(FIELDS[0])).toBeCloseTo(-Math.PI / 2)
  })

  it('seeds every node on its depth ring inside its field wedge', () => {
    const pos = seedPositions(model, 100)
    expect(pos.size).toBe(model.nodes.length)
    expect(pos.get(HUB_ID)).toEqual({ x: 0, y: 0 })
    for (const n of model.nodes) {
      if (n.depth === 0) continue
      const p = pos.get(n.id)!
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(n.depth * 100, 6)
      const w = model.fieldWedge.get(n.field)!
      let angle = Math.atan2(p.y, p.x)
      while (angle < w.start) angle += 2 * Math.PI
      while (angle > w.end) angle -= 2 * Math.PI
      expect(angle, n.id).toBeGreaterThanOrEqual(w.start - 1e-9)
      expect(angle, n.id).toBeLessThanOrEqual(w.end + 1e-9)
    }
  })

  it('is deterministic', () => {
    expect(buildGraphModel(ADVANCES)).toEqual(model)
    expect(seedPositions(buildGraphModel(ADVANCES), 80)).toEqual(seedPositions(model, 80))
  })

  it('truncates long labels', () => {
    const t = truncateLabel('Jump Disruption/Gravity Well Projectors')
    expect(t.endsWith('…')).toBe(true)
    expect(t.length).toBeLessThanOrEqual(22)
    expect(truncateLabel('Militia')).toBe('Militia')
  })
})
