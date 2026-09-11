import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Simulation, forceLink } from 'd3-force'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'
import type { D3ZoomEvent, ZoomBehavior, ZoomTransform } from 'd3-zoom'
import { ADVANCES, FIELDS } from '../data'
import type { Advance } from '../data'
import layoutJson from '../data/researchLayout.json'
import { advanceStatus, missingPrereqs, unlockedTier } from '../model'
import type { AdvanceStatus } from '../model'
import { QueueButton, Res } from './common'
import { HUB_ID, ancestorsOf, buildGraphModel, descendantsOf, truncateLabel } from './researchGraphModel'
import type { GraphNode } from './researchGraphModel'
import {
  HUB_R,
  LABEL_GAP,
  NODE_R,
  RING_GAP,
  buildSimLinks,
  buildSimNodes,
  fieldLabelPosition,
  formatLayout,
  makeSimulation,
  pickLabelSides,
  toLayoutPositions,
} from './researchGraphForces'
import type { LabelSide, LayoutPositions, SimLink, SimNode } from './researchGraphForces'

interface Props {
  empireName: string
  researched: ReadonlySet<string>
  queued: readonly string[]
  slots: number
  query: string
  onlyAvailable: boolean
  onToggle: (a: Advance) => void
}

const MODEL = buildGraphModel(ADVANCES)
/** Curated positions (see scripts/layout-research.ts and the Copy layout button). */
const LAYOUT = layoutJson as unknown as LayoutPositions
const LABEL_ZOOM = 0.6
const OUTER_R = (MODEL.maxDepth + 0.8) * RING_GAP
const FIELD_INDEX = new Map(FIELDS.map((f, i) => [f, i]))
const fieldColor = (field: string) => (field ? `var(--f${FIELD_INDEX.get(field) ?? 0})` : 'var(--accent)')

type LabelMode = 'auto' | 'all' | 'none'

/** Positions survive view switches and remounts, including the user's drags. */
const cache: { nodes: SimNode[]; links: SimLink[] } = { nodes: [], links: [] }

function resetCache(): void {
  cache.nodes = buildSimNodes(MODEL, LAYOUT)
  cache.links = buildSimLinks(MODEL, cache.nodes)
}

/** Advances without a baked position (after a data re-convert) are placed by the forces. */
const hasFreeNodes = () => cache.nodes.some((n) => n.fx == null)

/** SVG text placement for a label on the given side of a node of radius r. */
function labelAttrs(side: LabelSide, r: number): { x: number; y: number; textAnchor: 'middle' | 'start' | 'end' } {
  switch (side) {
    case 'below':
      return { x: 0, y: r + LABEL_GAP + 11, textAnchor: 'middle' }
    case 'above':
      return { x: 0, y: -r - LABEL_GAP - 3, textAnchor: 'middle' }
    case 'right':
      return { x: r + LABEL_GAP + 1, y: 4, textAnchor: 'start' }
    case 'left':
      return { x: -r - LABEL_GAP - 1, y: 4, textAnchor: 'end' }
  }
}

const linkPath = (l: SimLink): string => {
  const s = l.source as SimNode
  const t = l.target as SimNode
  const sx = s.x ?? 0
  const sy = s.y ?? 0
  const tx = t.x ?? 0
  const ty = t.y ?? 0
  const dx = tx - sx
  const dy = ty - sy
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // Stop at the target's rim so the arrowhead sits on the circle.
  const tr = (t.depth === 0 ? HUB_R : NODE_R) + 3
  const ex = tx - ux * tr
  const ey = ty - uy * tr
  // Gentle bow so parallel links separate.
  const bow = Math.min(18, len * 0.08)
  const cx = (sx + ex) / 2 - uy * bow
  const cy = (sy + ey) / 2 + ux * bow
  return `M${sx.toFixed(1)},${sy.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`
}

export function ResearchGraph({ empireName, researched, queued, slots, query, onlyAvailable, onToggle }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>()
  const simRef = useRef<Simulation<SimNode, SimLink>>()
  const [version, bump] = useState(0)
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity)
  const [selected, setSelected] = useState<string | null>(null)
  const [fieldFocus, setFieldFocus] = useState<string | null>(null)
  const [labelMode, setLabelMode] = useState<LabelMode>('auto')
  const [copied, setCopied] = useState<string | null>(null)
  const [layoutDump, setLayoutDump] = useState<string | null>(null)

  if (cache.nodes.length === 0) resetCache()

  const queuedSet = useMemo(() => new Set(queued), [queued])
  // Which side of each node its label sits on, re-chosen whenever positions change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const labelSides = useMemo(() => pickLabelSides(cache.nodes, cache.links), [version])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fieldLabels = useMemo(() => new Map(FIELDS.map((f) => [f, fieldLabelPosition(f, cache.nodes)])), [version])
  const statusById = useMemo(() => {
    const m = new Map<string, AdvanceStatus>()
    for (const a of ADVANCES) m.set(a.id, advanceStatus(a, researched))
    return m
  }, [researched])
  const related = useMemo(() => {
    if (!selected) return null
    const s = new Set([selected, ...ancestorsOf(selected, MODEL.preds), ...descendantsOf(selected, MODEL.succs)])
    return s
  }, [selected])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return new Set(ADVANCES.filter((a) => a.name.toLowerCase().includes(q) || a.effects.toLowerCase().includes(q)).map((a) => a.id))
  }, [query])

  const fitToNodes = useCallback((ids?: ReadonlySet<string>) => {
    const svg = svgRef.current
    const zb = zoomRef.current
    if (!svg || !zb) return
    const pts = cache.nodes.filter((n) => !ids || ids.has(n.id))
    if (!pts.length) return
    const xs = pts.map((n) => n.x ?? 0)
    const ys = pts.map((n) => n.y ?? 0)
    const pad = ids ? 70 : OUTER_R + 80
    const minX = ids ? Math.min(...xs) - pad : -pad
    const maxX = ids ? Math.max(...xs) + pad : pad
    const minY = ids ? Math.min(...ys) - pad : -pad
    const maxY = ids ? Math.max(...ys) + pad : pad
    const { width, height } = svg.getBoundingClientRect()
    const k = Math.max(0.15, Math.min(4, Math.min(width / (maxX - minX), height / (maxY - minY))))
    const t = zoomIdentity.translate(width / 2 - (k * (minX + maxX)) / 2, height / 2 - (k * (minY + maxY)) / 2).scale(k)
    zb.transform(select(svg), t)
  }, [])

  const panTo = useCallback((id: string) => {
    const svg = svgRef.current
    const zb = zoomRef.current
    const n = cache.nodes.find((n) => n.id === id)
    if (!svg || !zb || !n) return
    const { width, height } = svg.getBoundingClientRect()
    const k = Math.max(transform.k, 1)
    zb.transform(select(svg), zoomIdentity.translate(width / 2 - k * (n.x ?? 0), height / 2 - k * (n.y ?? 0)).scale(k))
  }, [transform.k])

  // Zoom / pan on the svg; node drags are excluded via the filter.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const zb = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .filter((e: Event) => !(e.target as Element).closest('.node') && !(e instanceof MouseEvent && e.button !== 0))
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => setTransform(e.transform))
    zoomRef.current = zb
    select(svg).call(zb)
    return () => {
      select(svg).on('.zoom', null)
    }
  }, [])

  // The layout is baked, so the simulation only ever places nodes that lack a position.
  useEffect(() => {
    const sim = makeSimulation(MODEL, cache.nodes, cache.links).on('tick', () => bump((v) => v + 1))
    simRef.current = sim
    if (hasFreeNodes()) {
      sim.tick(250)
      bump((v) => v + 1)
    }
    const raf = requestAnimationFrame(() => fitToNodes())
    return () => {
      cancelAnimationFrame(raf)
      sim.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function resetLayout() {
    resetCache()
    setSelected(null)
    const sim = simRef.current
    if (sim) {
      sim.nodes(cache.nodes)
      ;(sim.force('link') as ReturnType<typeof forceLink<SimNode, SimLink>>).links(cache.links)
      if (hasFreeNodes()) sim.tick(250)
    }
    bump((v) => v + 1)
    requestAnimationFrame(() => fitToNodes())
  }

  async function copyLayout() {
    const text = formatLayout(toLayoutPositions(cache.nodes))
    const count = cache.nodes.length - 1
    try {
      await navigator.clipboard.writeText(text)
      setCopied(`Copied ${count} positions`)
      setLayoutDump(null)
    } catch {
      setCopied(null)
      setLayoutDump(text)
    }
    window.setTimeout(() => setCopied(null), 3000)
  }

  // Node drag: pins the node where it is dropped. Reset layout restores the baked positions.
  function startDrag(node: SimNode, e: React.PointerEvent<SVGGElement>) {
    if (node.depth === 0 || e.button !== 0) return
    const svg = svgRef.current
    if (!svg) return
    e.preventDefault()
    const target = e.currentTarget
    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic or already-released pointer; dragging still works via bubbling */
    }
    const rect = svg.getBoundingClientRect()
    const toGraph = (ev: PointerEvent) => transform.invert([ev.clientX - rect.left, ev.clientY - rect.top])
    const start = toGraph(e.nativeEvent)
    const ox = (node.x ?? 0) - start[0]
    const oy = (node.y ?? 0) - start[1]
    let moved = false
    const sim = simRef.current
    const free = hasFreeNodes()
    const move = (ev: PointerEvent) => {
      const [gx, gy] = toGraph(ev)
      if (!moved && Math.hypot(gx - start[0], gy - start[1]) > 3) {
        moved = true
        if (free) sim?.alphaTarget(0.2).restart()
      }
      if (!moved) return
      node.fx = node.x = gx + ox
      node.fy = node.y = gy + oy
      bump((v) => v + 1)
    }
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
      if (moved) {
        if (free) sim?.alphaTarget(0)
      } else setSelected((s) => (s === node.id ? null : node.id))
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  const selectedNode = selected ? MODEL.nodeById.get(selected) : undefined
  const selectedAdvance = selectedNode?.advance
  const showLabelsGlobally = labelMode === 'all' || (labelMode === 'auto' && transform.k >= LABEL_ZOOM)

  const isDim = (n: GraphNode): boolean => {
    if (n.depth === 0) return false
    if (related && !related.has(n.id)) return true
    if (matches && !matches.has(n.id)) return true
    if (onlyAvailable && statusById.get(n.id) !== 'available') return true
    if (fieldFocus && n.field !== fieldFocus) return true
    return false
  }

  return (
    <div
      className="graphlayout"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setSelected(null)
          setFieldFocus(null)
        }
      }}
    >
      <div className="card graphcard">
        <div className="row wrap graphbar">
          <button onClick={() => fitToNodes()} title="Fit the whole graph in view">
            Fit
          </button>
          <button onClick={resetLayout} title="Put every node back where the saved layout has it">
            Reset layout
          </button>
          <button onClick={copyLayout} title="Layout tuning: copy every node's position as JSON for src/data/researchLayout.json">
            Copy layout
          </button>
          <label className="inline">
            Labels
            <select value={labelMode} onChange={(e) => setLabelMode(e.target.value as LabelMode)}>
              <option value="auto">auto</option>
              <option value="all">all</option>
              <option value="none">none</option>
            </select>
          </label>
          <span className="muted small">
            {copied ?? `${Math.round(transform.k * 100)}%`}
            {matches ? ` · ${matches.size} match${matches.size === 1 ? '' : 'es'}` : ''}
          </span>
        </div>
        {layoutDump && (
          <textarea
            className="layoutdump"
            readOnly
            value={layoutDump}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Layout JSON; select all and copy"
          />
        )}
        <svg ref={svgRef} className="graph" role="img" aria-label="Research graph">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" />
            </marker>
            <marker id="arrow-hi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>
          <g transform={transform.toString()}>
            <g className="rings">
              {Array.from({ length: MODEL.maxDepth }, (_, i) => (
                <circle key={i} className="ring" r={(i + 1) * RING_GAP} />
              ))}
              {FIELDS.map((f) => {
                const { x, y } = fieldLabels.get(f)!
                return (
                  <text
                    key={f}
                    className={`wedgelabel ${fieldFocus === f ? 'on' : ''}`}
                    x={x}
                    y={y}
                    style={{ fill: fieldColor(f) }}
                    onClick={() => setFieldFocus((cur) => (cur === f ? null : f))}
                  >
                    {f} <tspan className="muted">T{unlockedTier(f, researched)}</tspan>
                  </text>
                )
              })}
            </g>
            <g className="links">
              {cache.links.map((l, i) => {
                const s = l.source as SimNode
                const t = l.target as SimNode
                const hi = related ? related.has(s.id) && related.has(t.id) : false
                const dim = (related && !hi) || isDim(s) || isDim(t)
                return (
                  <path
                    key={i}
                    className={`link ${l.kind} ${hi ? 'hi' : ''} ${dim ? 'dim' : ''}`}
                    d={linkPath(l)}
                    markerEnd={hi ? 'url(#arrow-hi)' : 'url(#arrow)'}
                  />
                )
              })}
            </g>
            <g className="nodes">
              {cache.nodes.map((n) => {
                const status = n.depth === 0 ? undefined : statusById.get(n.id)
                const isQueued = queuedSet.has(n.id)
                const isSel = selected === n.id
                const dim = isDim(n)
                const r = n.depth === 0 ? HUB_R : NODE_R
                const showLabel =
                  n.depth === 0 || isSel || (related?.has(n.id) ?? false) || (matches?.has(n.id) ?? false) || (showLabelsGlobally && !dim)
                const color = fieldColor(n.field)
                const label = n.depth === 0 ? empireName : truncateLabel(n.label)
                const side: LabelSide = labelSides.get(n.id) ?? 'below'
                const multi = n.advance?.prereq.all && n.advance.prereq.all.length > 1 ? n.advance.prereq.all.length : 0
                return (
                  <g
                    key={n.id}
                    className={`node ${status ?? 'hub'} ${isQueued ? 'queued' : ''} ${isSel ? 'selected' : ''} ${dim ? 'dim' : ''} ${
                      matches?.has(n.id) ? 'match' : ''
                    }`}
                    transform={`translate(${(n.x ?? 0).toFixed(1)},${(n.y ?? 0).toFixed(1)})`}
                    style={{ color }}
                    tabIndex={n.depth === 0 ? -1 : 0}
                    role="button"
                    aria-pressed={isSel}
                    aria-label={n.depth === 0 ? empireName : `${n.label}, ${n.field} tier ${n.tier}, ${status}${isQueued ? ', queued' : ''}`}
                    onPointerDown={(e) => startDrag(n, e)}
                    onDoubleClick={() => {
                      if (n.depth === 0) return
                      setSelected(n.id)
                      fitToNodes(new Set([n.id, ...ancestorsOf(n.id, MODEL.preds), ...descendantsOf(n.id, MODEL.succs)]))
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelected((s) => (s === n.id ? null : n.id))
                      }
                    }}
                  >
                    <title>
                      {n.label}
                      {n.advance ? ` — ${n.advance.effects}` : ''}
                    </title>
                    {isQueued && <circle className="halo" r={r + 6} />}
                    <circle className="core" r={r} style={{ fill: color }} />
                    {status === 'researched' && (
                      <text className="tick" dy="0.36em">
                        ✓
                      </text>
                    )}
                    {multi > 0 && (
                      <g className="badge" transform={`translate(${r * 0.75},${-r * 0.75})`}>
                        <title>Needs all {multi} prerequisites</title>
                        <circle r={6} />
                        <text dy="0.35em">{multi}</text>
                      </g>
                    )}
                    {showLabel && (
                      <text className="label" {...labelAttrs(side, r)}>
                        {label}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </g>
        </svg>
        <div className="legend">
          {FIELDS.map((f) => (
            <button
              key={f}
              className={`swatch ${fieldFocus === f ? 'on' : ''}`}
              onClick={() => setFieldFocus((cur) => (cur === f ? null : f))}
              title={fieldFocus === f ? 'Show all fields' : `Highlight ${f}`}
            >
              <i style={{ background: fieldColor(f) }} /> {f}
            </button>
          ))}
        </div>
      </div>

      <aside className="card graphdetail" aria-label="Selected advance">
        {!selectedNode ? (
          <>
            <h3>Research graph</h3>
            <p className="muted small">
              Click an advance to see its details and light up everything it needs and everything it leads to. Drag nodes to
              rearrange, scroll to zoom, double-click to focus on a chain. Dashed lines mean “one of”; dotted lines are tier
              unlocks within a field. A numbered badge marks an advance that needs all of several prerequisites.
            </p>
          </>
        ) : !selectedAdvance ? (
          <>
            <h3>{empireName}</h3>
            <p className="muted small">
              Advances researched: {researched.size} of {ADVANCES.length}. Higher Education and Infrastructure Research are the
              two places to start.
            </p>
          </>
        ) : (
          <SelectedAdvance
            a={selectedAdvance}
            node={selectedNode}
            status={statusById.get(selectedAdvance.id)!}
            researched={researched}
            queued={queuedSet.has(selectedAdvance.id)}
            queuedCount={queued.length}
            slots={slots}
            onToggle={() => onToggle(selectedAdvance)}
            onSelect={(id) => {
              setSelected(id)
              panTo(id)
            }}
          />
        )}
      </aside>
    </div>
  )
}

function SelectedAdvance({
  a,
  node,
  status,
  researched,
  queued,
  queuedCount,
  slots,
  onToggle,
  onSelect,
}: {
  a: Advance
  node: GraphNode
  status: AdvanceStatus
  researched: ReadonlySet<string>
  queued: boolean
  queuedCount: number
  slots: number
  onToggle: () => void
  onSelect: (id: string) => void
}) {
  const missing = status === 'locked' ? missingPrereqs(a.prereq, researched) : []
  const requires = (MODEL.preds.get(a.id) ?? []).filter((id) => id !== HUB_ID)
  const leadsTo = MODEL.succs.get(a.id) ?? []
  const nameOf = (id: string) => MODEL.nodeById.get(id)?.label ?? id
  return (
    <>
      <div className="row">
        <span className="swatchdot" style={{ background: fieldColor(a.field) }} />
        <h3 style={{ margin: 0 }}>{a.name}</h3>
      </div>
      <p className="muted small">
        {a.field} · Tier {a.tier} · {node.depth} step{node.depth === 1 ? '' : 's'} from start ·{' '}
        <span className={`kind ${status}`}>{queued ? 'queued' : status}</span>
      </p>
      <p className="small">{a.effects}</p>
      {a.notes && <p className="muted small">{a.notes}</p>}
      <p className="small">
        <Res r={a.cost} />
      </p>
      {missing.length > 0 && <p className="small neg">Needs: {missing.join('; ')}</p>}
      {status === 'locked' && missing.length === 0 && (
        <p className="small neg">
          Needs Tier {a.tier} of {a.field} unlocked.
        </p>
      )}
      {a.prereq.note && <p className="small muted">Note: {a.prereq.note}</p>}
      <p>
        <QueueButton status={status} queued={queued} slots={slots} queuedCount={queuedCount} onToggle={onToggle} />
      </p>
      {requires.length > 0 && (
        <>
          <h4>Requires</h4>
          <ul className="compact small">
            {requires.map((id) => (
              <li key={id}>
                <button className="link" onClick={() => onSelect(id)}>
                  {nameOf(id)}
                </button>
                {a.prereq.any?.includes(id) && <span className="muted"> (one of)</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {leadsTo.length > 0 && (
        <>
          <h4>Leads to</h4>
          <ul className="compact small">
            {leadsTo.map((id) => (
              <li key={id}>
                <button className="link" onClick={() => onSelect(id)}>
                  {nameOf(id)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
