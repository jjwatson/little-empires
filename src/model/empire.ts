import { ADVANCE_BY_ID, FACILITY_BY_ID, facilityCostOn } from '../data'
import type { BlueprintScale, PlanetType, ResourceSet } from '../data'

export const SCHEMA_VERSION = 3

/** A facility that is not in the construction catalogue: something that happened in play. */
export interface CustomFacility {
  name: string
  /** Per-turn change to the stockpile; negatives are upkeep. */
  income: ResourceSet
  notes?: string
}

export interface OwnedFacility {
  /** Catalogue id, or `custom:<uuid>` when `custom` is set. */
  facilityId: string
  count: number
  custom?: CustomFacility
}

/**
 * A Custom Build: a multi-round project agreed in play rather than taken from the catalogue.
 * Its cost is paid at the end of every colony turn it is in progress, the first included, and
 * when it finishes it becomes a custom facility yielding `income` a turn (negative for upkeep).
 */
export interface CustomBuild extends CustomFacility {
  costPerTurn: ResourceSet
  /** Colony turns from start to finish. */
  turns: number
}

export interface BuildInProgress {
  /** Catalogue id, or `custom:<uuid>` when `custom` is set. */
  facilityId: string
  turnsLeft: number
  custom?: CustomBuild
}

/** One row of the Demographics tab: a species and how many of them live on the planet. */
export interface Species {
  name: string
  population: number
}

/** Descriptive fields from the Planets tab of the tracking sheet. Free text, no game effect. */
export const PROFILE_FIELDS = [
  'Star',
  'System',
  'Temperature',
  'Atmosphere',
  'Hydrosphere',
  'Gravity',
  'Terrain',
  'Length of day',
  'Length of year',
  'Starport',
  'Tech level',
  'Major exports',
  'Major imports',
  'Orbital bodies',
  'Exotic resources',
] as const

export interface Planet {
  id: string
  name: string
  type: PlanetType
  /** Total population. When `species` is non-empty it is kept equal to their sum. */
  population: number
  species: Species[]
  /** GM adjustment to the per-turn growth rate (0.005 = +0.5%). */
  growthAdjust: number
  /** GM-supplied per-turn generation on top of the population-derived credits. */
  baseIncome: ResourceSet
  profile: Record<string, string>
  facilities: OwnedFacility[]
  inProgress?: BuildInProgress
}

export type LedgerKind =
  | 'start'
  | 'income'
  | 'research'
  | 'prototype'
  | 'construction'
  | 'blueprint'
  | 'colony'
  | 'adjustment'
  | 'event'

/** One row of the Balance Sheet tab. */
export interface LedgerLine {
  id: string
  turn: number
  kind: LedgerKind
  label: string
  planetId?: string
  delta: ResourceSet
  at: string
  by: string
  notes?: string
}

/** Link from a blueprint to the D6 Holocron item it was picked from, with its list price. */
export interface ItemRef {
  itemId?: string
  /** List price in credits from the wiki, for reference; the blueprint's own cost is by scale. */
  credits?: number
}

export interface Blueprint extends ItemRef {
  id: string
  name: string
  scale: BlueprintScale
  turn: number
}

export interface Empire {
  schemaVersion: number
  id: string
  name: string
  turn: number
  resources: ResourceSet
  researched: string[]
  /** Advance id of the governmental system in operation (only one may be active at a time). */
  government?: string
  blueprints: Blueprint[]
  planets: Planet[]
  ledger: LedgerLine[]
  /** Names of planets removed by GM edit, so their old ledger lines still read well. */
  formerPlanets?: { id: string; name: string }[]
  updatedAt: string
  updatedBy: string
}

export const ZERO: ResourceSet = { credits: 0, rawMats: 0, energy: 0, manpower: 0 }

export const add = (a: ResourceSet, b: ResourceSet): ResourceSet => ({
  credits: a.credits + b.credits,
  rawMats: a.rawMats + b.rawMats,
  energy: a.energy + b.energy,
  manpower: a.manpower + b.manpower,
})
export const sub = (a: ResourceSet, b: ResourceSet): ResourceSet => ({
  credits: a.credits - b.credits,
  rawMats: a.rawMats - b.rawMats,
  energy: a.energy - b.energy,
  manpower: a.manpower - b.manpower,
})
export const mul = (a: ResourceSet, n: number): ResourceSet => ({
  credits: a.credits * n,
  rawMats: a.rawMats * n,
  energy: a.energy * n,
  manpower: a.manpower * n,
})
export const neg = (a: ResourceSet): ResourceSet => mul(a, -1)
export const covers = (have: ResourceSet, need: ResourceSet): boolean =>
  have.credits >= need.credits &&
  have.rawMats >= need.rawMats &&
  have.energy >= need.energy &&
  have.manpower >= need.manpower
export const isZero = (a: ResourceSet): boolean => !a.credits && !a.rawMats && !a.energy && !a.manpower

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export function newPlanet(name: string, type: PlanetType, population: number, baseIncome: ResourceSet): Planet {
  return {
    id: newId(),
    name,
    type,
    population,
    species: [],
    growthAdjust: 0,
    baseIncome: { ...baseIncome },
    profile: {},
    facilities: [],
  }
}

export function newEmpire(name: string, homeworld: Planet, resources: ResourceSet, by: string): Empire {
  const at = new Date().toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name,
    turn: 1,
    resources: { ...resources },
    researched: [],
    blueprints: [],
    planets: [homeworld],
    ledger: [{ id: newId(), turn: 0, kind: 'start', label: 'Colony start', delta: { ...resources }, at, by }],
    updatedAt: at,
    updatedBy: by,
  }
}

/** Number of a given facility owned across the whole empire. */
export function countFacility(empire: Empire, facilityId: string): number {
  let n = 0
  for (const p of empire.planets) for (const f of p.facilities) if (f.facilityId === facilityId) n += f.count
  return n
}

/** Built or currently being built on this planet. */
export function planetHas(planet: Planet, facilityId: string): boolean {
  return planet.facilities.some((f) => f.facilityId === facilityId) || planet.inProgress?.facilityId === facilityId
}

export function addFacility(planet: Planet, facilityId: string): Planet {
  const facilities = planet.facilities.map((f) => ({ ...f }))
  const existing = facilities.find((f) => f.facilityId === facilityId)
  if (existing) existing.count += 1
  else facilities.push({ facilityId, count: 1 })
  return { ...planet, facilities }
}

/** Take `count` of a facility away (all of them when omitted); the row goes when it reaches zero. */
export function removeFacility(planet: Planet, facilityId: string, count?: number): Planet {
  const facilities = planet.facilities
    .map((f) => (f.facilityId === facilityId ? { ...f, count: count === undefined ? 0 : f.count - count } : { ...f }))
    .filter((f) => f.count > 0)
  return { ...planet, facilities }
}

export const CUSTOM_PREFIX = 'custom:'
export const isCustomFacility = (o: OwnedFacility): boolean => !!o.custom

export const newCustomId = (): string => CUSTOM_PREFIX + newId()

export function addCustomFacility(planet: Planet, custom: CustomFacility, count = 1, facilityId = newCustomId()): Planet {
  return { ...planet, facilities: [...planet.facilities, { facilityId, count, custom }] }
}

/** The first planet is the homeworld by convention; it can never be removed. */
export const isHomeworld = (empire: Empire, planetId: string): boolean => empire.planets[0]?.id === planetId

/** Planet name for display, falling back to planets removed by GM edit and then the raw id. */
export function planetNameOf(empire: Empire, id?: string): string {
  if (!id) return ''
  return empire.planets.find((p) => p.id === id)?.name ?? empire.formerPlanets?.find((p) => p.id === id)?.name ?? id
}

/** Colonising a new world: rules under "Planet Types". */
export const COLONY_POPULATION = 50_000
export const HOMEWORLD_MIN_POPULATION = 500_000
export const COLONY_SETUP_COST: ResourceSet = { credits: 200_000, rawMats: 1_000, energy: 2_000, manpower: 5_000 }

// ---------------------------------------------------------------------------
// Migration of files written by earlier versions of the app.

interface V1TurnEntry {
  turn: number
  at: string
  by: string
  researched: string[]
  builds: { planetId: string; facilityId: string }[]
  income: ResourceSet
  notes?: string
}

/** Bring a loaded file up to the current schema, one version step at a time. */
export function migrate(raw: unknown): Empire {
  const version = (raw as { schemaVersion?: number }).schemaVersion ?? 1
  if (version > SCHEMA_VERSION) throw new Error('This empire was saved by a newer version of the app. Reload the page to update.')
  let e: Empire = version < 2 ? migrateV1(raw) : (raw as Empire)
  if (version < 3) e = migrateV2(e)
  return e
}

/**
 * v1 files had a per-turn `log` and a fully GM-entered base income; v2 itemises the ledger and
 * derives credits from population, so the old credit base is dropped (the formula replaces it)
 * and the start balance is back-solved so the ledger still reconciles with the stockpile.
 */
function migrateV1(raw: unknown): Empire {
  const e = raw as Record<string, unknown>

  const planets = ((e.planets as Planet[]) ?? []).map((p) => ({
    ...p,
    species: p.species ?? [],
    growthAdjust: p.growthAdjust ?? 0,
    profile: p.profile ?? {},
    baseIncome: { ...p.baseIncome, credits: 0 },
  }))
  const byId = new Map(planets.map((p) => [p.id, p]))

  const ledger: LedgerLine[] = []
  for (const t of (e.log as V1TurnEntry[]) ?? []) {
    ledger.push({
      id: newId(),
      turn: t.turn,
      kind: 'income',
      label: `Income CT ${t.turn}`,
      delta: t.income,
      at: t.at,
      by: t.by,
      notes: t.notes,
    })
    for (const id of t.researched) {
      const a = ADVANCE_BY_ID.get(id)
      ledger.push({ id: newId(), turn: t.turn, kind: 'research', label: a?.name ?? id, delta: neg(a?.cost ?? ZERO), at: t.at, by: t.by })
    }
    for (const b of t.builds) {
      const f = FACILITY_BY_ID.get(b.facilityId)
      const p = byId.get(b.planetId)
      const cost = f && p ? facilityCostOn(p.type, f) : ZERO
      ledger.push({
        id: newId(),
        turn: t.turn,
        kind: 'construction',
        label: f?.name ?? b.facilityId,
        planetId: b.planetId,
        delta: neg(cost),
        at: t.at,
        by: t.by,
      })
    }
  }
  const resources = e.resources as ResourceSet
  const start = ledger.reduce((acc, l) => sub(acc, l.delta), resources)
  const at = (e.updatedAt as string) ?? new Date().toISOString()
  const by = (e.updatedBy as string) ?? 'migration'
  ledger.unshift({ id: newId(), turn: 0, kind: 'start', label: 'Colony start', delta: start, at, by })

  return {
    schemaVersion: 2,
    id: e.id as string,
    name: e.name as string,
    turn: e.turn as number,
    resources,
    researched: (e.researched as string[]) ?? [],
    government: e.government as string | undefined,
    blueprints: (e.blueprints as Blueprint[]) ?? [],
    planets,
    ledger,
    updatedAt: at,
    updatedBy: by,
  }
}

/** v3 adds optional fields only (custom facilities, GM events, former planets); v2 data is already valid. */
function migrateV2(e: Empire): Empire {
  return {
    ...e,
    schemaVersion: 3,
    planets: e.planets.map((p) => ({ ...p, facilities: p.facilities.map((f) => ({ ...f, count: f.count ?? 1 })) })),
  }
}
