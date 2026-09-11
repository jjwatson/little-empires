import { describe, expect, it } from 'vitest'
import { ADVANCES, ADVANCE_BY_ID } from '../data'
import layoutJson from '../data/researchLayout.json'
import { buildGraphModel } from './researchGraphModel'
import { NODE_R, buildSimLinks, buildSimNodes, countCrossings, labelPenalty, minDistance, pickLabelSides } from './researchGraphForces'
import type { LayoutPositions } from './researchGraphForces'

/**
 * Guards the curated layout in src/data/researchLayout.json. Regenerate with
 * `npx vite-node scripts/layout-research.ts` or paste from the Graph view's
 * Copy layout button. Raise CROSSING_CEILING deliberately, never to make a
 * tangled paste pass.
 */
const CROSSING_CEILING = 400
/** Weighted label clashes (see LABEL_WEIGHTS) with the renderer's side choice. */
const LABEL_CLASH_CEILING = 200

const LAYOUT = layoutJson as unknown as LayoutPositions
const model = buildGraphModel(ADVANCES)

describe('baked research layout', () => {
  it('has a position for every advance and no stale ids', () => {
    for (const a of ADVANCES) expect(LAYOUT[a.id], a.id).toBeDefined()
    for (const id of Object.keys(LAYOUT)) expect(ADVANCE_BY_ID.has(id), `stale id ${id}`).toBe(true)
    for (const [id, p] of Object.entries(LAYOUT)) {
      expect(p, id).toHaveLength(2)
      expect(Number.isFinite(p[0]) && Number.isFinite(p[1]), id).toBe(true)
    }
  })

  it('keeps nodes apart', () => {
    const nodes = buildSimNodes(model, LAYOUT)
    expect(minDistance(nodes)).toBeGreaterThanOrEqual(2 * NODE_R)
  })

  it('pins every baked node and leaves nothing to the simulation', () => {
    const nodes = buildSimNodes(model, LAYOUT)
    for (const n of nodes) expect(n.fx, n.id).toBeDefined()
  })

  it('stays under the crossing ceiling', () => {
    const nodes = buildSimNodes(model, LAYOUT)
    const links = buildSimLinks(model, nodes)
    expect(countCrossings(links)).toBeLessThanOrEqual(CROSSING_CEILING)
  })

  it('keeps label clashes under the ceiling', () => {
    const nodes = buildSimNodes(model, LAYOUT)
    const links = buildSimLinks(model, nodes)
    const sides = pickLabelSides(nodes, links)
    expect(sides.size).toBe(nodes.length)
    expect(labelPenalty(nodes, links, sides)).toBeLessThanOrEqual(LABEL_CLASH_CEILING)
  })
})
