import { useId } from 'react'
import { FACILITY_BY_ID, PLANET_TYPES } from '../data'
import type { FacilityCategory, PlanetType } from '../data'
import { describeFacility } from '../model'
import type { BuildInProgress, OwnedFacility } from '../model'

/**
 * Procedural planet artwork: a shaded SVG globe whose palette and surface
 * pattern come from the planet type, with per-planet variation from a seed.
 * Optional facility markers ring the globe, one pip per facility group.
 */

interface Props {
  type: PlanetType
  /** Rendered width and height in px. */
  size?: number
  /** Anything stable per planet (its id); same seed, same picture. */
  seed?: string
  facilities?: readonly OwnedFacility[]
  inProgress?: BuildInProgress
  /** Accessible name; defaults to the type name. */
  label?: string
  className?: string
}

/** Facility categories collapsed into the groups a pip can show. */
export type MarkerGroup = 'Power' | 'Farming' | 'Mining' | 'Industry' | 'Ships' | 'Stations' | 'Defences' | 'Research' | 'Commerce' | 'Other'
export const MARKER_GROUPS: readonly MarkerGroup[] = ['Research', 'Power', 'Farming', 'Mining', 'Industry', 'Ships', 'Stations', 'Defences', 'Commerce', 'Other']
export const MARKER_COLORS: Record<MarkerGroup, string> = {
  Research: '#7c8cf5',
  Power: '#f2c23a',
  Farming: '#5fbf5f',
  Mining: '#c98a4b',
  Industry: '#b07de0',
  Ships: '#4f9de8',
  Stations: '#4fd0c8',
  Defences: '#ef6a6a',
  Commerce: '#f08fc4',
  Other: '#9aa3ad',
}
const GROUP_OF: Record<FacilityCategory, MarkerGroup> = {
  'Research Facilities': 'Research',
  'Power Facilities': 'Power',
  'Farming Facilities': 'Farming',
  'Mining Facilities': 'Mining',
  'Training Facilities': 'Other',
  Droids: 'Industry',
  Computers: 'Industry',
  Vehicles: 'Industry',
  Fabrication: 'Industry',
  Weapons: 'Industry',
  Starfighters: 'Ships',
  'Capital Ships': 'Ships',
  'Space Stations': 'Stations',
  Defences: 'Defences',
  Commerce: 'Commerce',
  'Other Facilities': 'Other',
}

export interface Marker {
  group: MarkerGroup
  count: number
  names: string[]
}

/** Facilities grouped for the marker ring, in a fixed order. */
export function markersFor(facilities: readonly OwnedFacility[]): Marker[] {
  const byGroup = new Map<MarkerGroup, Marker>()
  for (const owned of facilities) {
    const info = describeFacility(owned)
    if (!info) continue
    const group = GROUP_OF[info.category]
    const m = byGroup.get(group) ?? { group, count: 0, names: [] }
    m.count += owned.count
    m.names.push(owned.count > 1 ? `${info.name} ×${owned.count}` : info.name)
    byGroup.set(group, m)
  }
  return MARKER_GROUPS.filter((g) => byGroup.has(g)).map((g) => byGroup.get(g)!)
}

// --- deterministic randomness -------------------------------------------------------------

function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

const range = (r: () => number, a: number, b: number) => a + (b - a) * r()

// --- geometry -----------------------------------------------------------------------------

const C = 50 // centre of the 100×100 view box
const R = 38 // globe radius; the marker ring sits outside it
const RING = 46

/** A soft blob path (a wobbly ellipse) for continents, dunes and islands. */
function blob(r: () => number, cx: number, cy: number, rx: number, ry: number): string {
  const pts = 8
  let d = ''
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2
    const w = i === pts ? 1 : range(r, 0.72, 1.18)
    const x = cx + Math.cos(a) * rx * w
    const y = cy + Math.sin(a) * ry * w
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1)
  }
  return d + 'Z'
}

interface Palette {
  base: string
  dark: string
  light: string
  glow?: string
}

const PALETTE: Record<PlanetType, Palette> = {
  homeworld: { base: '#2f6fbf', dark: '#1d4a86', light: '#6fa8e6', glow: '#8ec5ff' },
  arid: { base: '#d3a560', dark: '#a8783a', light: '#eccb90', glow: '#ffd9a0' },
  arctic: { base: '#cfe6f2', dark: '#8fb6cc', light: '#ffffff', glow: '#dff3ff' },
  barren: { base: '#8a8a90', dark: '#5b5b62', light: '#b8b8be' },
  space: { base: '#3b4252', dark: '#232833', light: '#8a94a8' },
  aquatic: { base: '#1f6fa8', dark: '#134a75', light: '#5fb3e0', glow: '#8fd8ff' },
  volcanic: { base: '#3a2a2a', dark: '#1e1414', light: '#6b4a44', glow: '#ff8a3d' },
}

function Surface({ type, r }: { type: PlanetType; r: () => number }) {
  const p = PALETTE[type]
  switch (type) {
    case 'homeworld': {
      const land = Array.from({ length: 4 }, () => blob(r, range(r, 22, 78), range(r, 22, 78), range(r, 9, 18), range(r, 7, 14)))
      return (
        <>
          {land.map((d, i) => (
            <path key={i} d={d} fill={i % 2 ? '#5c9a4a' : '#7bb35a'} opacity={0.95} />
          ))}
          <ellipse cx={C} cy={C - R + 3} rx={16} ry={5} fill="#ffffff" opacity={0.85} />
          <ellipse cx={C} cy={C + R - 3} rx={13} ry={4} fill="#ffffff" opacity={0.8} />
          {Array.from({ length: 3 }, (_, i) => (
            <path
              key={`c${i}`}
              d={`M${range(r, 15, 40).toFixed(1)},${range(r, 25, 75).toFixed(1)} q12,-4 ${range(r, 18, 32).toFixed(1)},0`}
              stroke="#ffffff"
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
              opacity={0.55}
            />
          ))}
        </>
      )
    }
    case 'arid':
      return (
        <>
          {Array.from({ length: 5 }, (_, i) => {
            const y = 20 + i * 14 + range(r, -3, 3)
            return <path key={i} d={`M5,${y} q22,${range(r, -6, 6)} 45,0 t45,${range(r, -5, 5)}`} stroke={p.dark} strokeWidth={range(r, 2, 4)} fill="none" opacity={0.55} />
          })}
          {Array.from({ length: 3 }, (_, i) => (
            <path key={`k${i}`} d={blob(r, range(r, 25, 75), range(r, 25, 75), range(r, 4, 8), range(r, 3, 6))} fill="#8a5a2b" opacity={0.6} />
          ))}
        </>
      )
    case 'arctic':
      return (
        <>
          <path d={blob(r, C, C - R + 6, 26, 12)} fill="#ffffff" opacity={0.95} />
          <path d={blob(r, C, C + R - 6, 24, 11)} fill="#ffffff" opacity={0.9} />
          {Array.from({ length: 3 }, (_, i) => (
            <path key={i} d={blob(r, range(r, 25, 75), range(r, 35, 65), range(r, 6, 12), range(r, 4, 8))} fill="#f2fbff" opacity={0.85} />
          ))}
          {Array.from({ length: 4 }, (_, i) => (
            <path
              key={`l${i}`}
              d={`M${range(r, 15, 85).toFixed(1)},${range(r, 20, 80).toFixed(1)} l${range(r, -14, 14).toFixed(1)},${range(r, -10, 10).toFixed(1)}`}
              stroke={p.dark}
              strokeWidth={1}
              opacity={0.6}
            />
          ))}
        </>
      )
    case 'barren':
      return (
        <>
          {Array.from({ length: 7 }, (_, i) => {
            const cx = range(r, 20, 80)
            const cy = range(r, 20, 80)
            const cr = range(r, 3, 9)
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={cr} fill={p.dark} opacity={0.8} />
                <circle cx={cx - cr * 0.25} cy={cy - cr * 0.25} r={cr * 0.6} fill={p.base} opacity={0.9} />
              </g>
            )
          })}
        </>
      )
    case 'aquatic':
      return (
        <>
          {Array.from({ length: 6 }, (_, i) => {
            const y = 18 + i * 12 + range(r, -2, 2)
            return <path key={i} d={`M8,${y} q10,-3 20,0 t20,0 t20,0 t20,0`} stroke={p.light} strokeWidth={1.4} fill="none" opacity={0.55} />
          })}
          {Array.from({ length: 2 }, (_, i) => (
            <path key={`i${i}`} d={blob(r, range(r, 30, 70), range(r, 30, 70), range(r, 4, 7), range(r, 3, 5))} fill="#6f9f5a" opacity={0.9} />
          ))}
        </>
      )
    case 'volcanic':
      return (
        <>
          {Array.from({ length: 6 }, (_, i) => (
            <path
              key={i}
              d={`M${range(r, 15, 85).toFixed(1)},${range(r, 15, 85).toFixed(1)} l${range(r, -12, 12).toFixed(1)},${range(r, -12, 12).toFixed(1)} l${range(r, -10, 10).toFixed(1)},${range(r, -10, 10).toFixed(1)}`}
              stroke="#ff7a2a"
              strokeWidth={range(r, 1, 2.2)}
              strokeLinecap="round"
              fill="none"
              opacity={0.9}
            />
          ))}
          {Array.from({ length: 3 }, (_, i) => (
            <circle key={`g${i}`} cx={range(r, 25, 75)} cy={range(r, 25, 75)} r={range(r, 2, 4)} fill="#ffb347" opacity={0.95} />
          ))}
        </>
      )
    case 'space':
      // A hub station with a habitat ring and solar panels rather than a world.
      return (
        <>
          <ellipse cx={C} cy={C} rx={34} ry={11} fill="none" stroke={p.light} strokeWidth={5} opacity={0.9} />
          <ellipse cx={C} cy={C} rx={34} ry={11} fill="none" stroke={p.dark} strokeWidth={1.5} />
          <rect x={C - 30} y={C - 3} width={16} height={6} fill="#4f7fd6" opacity={0.9} />
          <rect x={C + 14} y={C - 3} width={16} height={6} fill="#4f7fd6" opacity={0.9} />
          <circle cx={C} cy={C} r={12} fill={p.light} />
          <circle cx={C - 3} cy={C - 3} r={5} fill="#dfe6f3" />
          {Array.from({ length: 6 }, (_, i) => (
            <circle key={i} cx={C + Math.cos((i / 6) * Math.PI * 2) * 34} cy={C + Math.sin((i / 6) * Math.PI * 2) * 11} r={1.6} fill="#ffe27a" />
          ))}
        </>
      )
  }
}

export function PlanetGlobe({ type, size = 48, seed = type, facilities = [], inProgress, label, className }: Props) {
  const id = useId().replace(/:/g, '')
  const p = PALETTE[type]
  const r = rng(`${type}:${seed}`)
  const typeName = PLANET_TYPES.find((t) => t.id === type)?.name ?? type
  const markers = markersFor(facilities)
  const total = markers.length + (inProgress ? 1 : 0)
  const isBody = type !== 'space'
  // Pips keep a legible on-screen size: larger in the view box when the globe is drawn small.
  const pipR = Math.min(9, Math.max(4.5, (4.5 * 90) / size))
  const pipFont = pipR * 1.3

  return (
    <svg
      className={`globe ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={label ?? typeName}
    >
      <title>{label ?? typeName}</title>
      <defs>
        <clipPath id={`${id}-clip`}>
          <circle cx={C} cy={C} r={R} />
        </clipPath>
        <radialGradient id={`${id}-shade`} cx="35%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.35} />
          <stop offset="45%" stopColor="#ffffff" stopOpacity={0} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.55} />
        </radialGradient>
        {p.glow && (
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="80%" stopColor={p.glow} stopOpacity={0} />
            <stop offset="100%" stopColor={p.glow} stopOpacity={0.55} />
          </radialGradient>
        )}
      </defs>
      {p.glow && <circle cx={C} cy={C} r={R + 4} fill={`url(#${id}-glow)`} />}
      {isBody ? (
        <>
          <circle cx={C} cy={C} r={R} fill={p.base} />
          <g clipPath={`url(#${id}-clip)`}>
            <Surface type={type} r={r} />
          </g>
          <circle cx={C} cy={C} r={R} fill={`url(#${id}-shade)`} />
          <circle cx={C} cy={C} r={R} fill="none" stroke={p.dark} strokeWidth={0.8} opacity={0.6} />
        </>
      ) : (
        <>
          {Array.from({ length: 14 }, (_, i) => (
            <circle key={i} cx={range(r, 4, 96)} cy={range(r, 4, 96)} r={range(r, 0.4, 1.1)} fill="#ffffff" opacity={range(r, 0.3, 0.9)} />
          ))}
          <Surface type={type} r={r} />
        </>
      )}
      {total > 0 && (
        <g className="markers">
          {markers.map((m, i) => {
            const a = -Math.PI / 2 + ((i + 0.5) / total) * Math.PI * 2
            const x = C + Math.cos(a) * RING
            const y = C + Math.sin(a) * RING
            return (
              <g key={m.group}>
                <title>{`${m.group}: ${m.names.join(', ')}`}</title>
                <circle cx={x} cy={y} r={pipR} fill={MARKER_COLORS[m.group]} stroke="var(--card)" strokeWidth={1.2} />
                {m.count > 1 && (
                  <text x={x} y={y} dy="0.36em" textAnchor="middle" fontSize={pipFont} fontWeight={700} fill="#111">
                    {m.count}
                  </text>
                )}
              </g>
            )
          })}
          {inProgress && (
            <g>
              <title>{`Building ${FACILITY_BY_ID.get(inProgress.facilityId)?.name ?? inProgress.facilityId}, ${inProgress.turnsLeft} turn${inProgress.turnsLeft === 1 ? '' : 's'} left`}</title>
              <circle
                cx={C + Math.cos(-Math.PI / 2 + ((total - 0.5) / total) * Math.PI * 2) * RING}
                cy={C + Math.sin(-Math.PI / 2 + ((total - 0.5) / total) * Math.PI * 2) * RING}
                r={pipR}
                fill="none"
                stroke="var(--muted)"
                strokeWidth={1.4}
                strokeDasharray="2 1.5"
              />
            </g>
          )}
        </g>
      )}
    </svg>
  )
}

/** Legend for the marker colours, listing only the groups present. */
export function MarkerLegend({ facilities }: { facilities: readonly OwnedFacility[] }) {
  const markers = markersFor(facilities)
  if (!markers.length) return null
  return (
    <div className="chips globe-legend">
      {markers.map((m) => (
        <span key={m.group} className="chip" title={m.names.join(', ')}>
          <i style={{ background: MARKER_COLORS[m.group] }} /> {m.group}
          {m.count > 1 ? ` ×${m.count}` : ''}
        </span>
      ))}
    </div>
  )
}
