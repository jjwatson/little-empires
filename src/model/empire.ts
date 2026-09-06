import type { PlanetType, ResourceSet } from '../data'

export const SCHEMA_VERSION = 1

export interface OwnedFacility {
  facilityId: string
  count: number
}

export interface BuildInProgress {
  facilityId: string
  turnsLeft: number
}

export interface Planet {
  id: string
  name: string
  type: PlanetType
  population: number
  /** GM-supplied per-turn generation from planet type and population (rules give no formula). */
  baseIncome: ResourceSet
  facilities: OwnedFacility[]
  inProgress?: BuildInProgress
}

export interface TurnEntry {
  turn: number
  at: string
  by: string
  researched: string[]
  builds: { planetId: string; facilityId: string }[]
  spent: ResourceSet
  income: ResourceSet
  notes?: string
}

export interface Empire {
  schemaVersion: number
  id: string
  name: string
  turn: number
  resources: ResourceSet
  researched: string[]
  planets: Planet[]
  log: TurnEntry[]
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
export const covers = (have: ResourceSet, need: ResourceSet): boolean =>
  have.credits >= need.credits &&
  have.rawMats >= need.rawMats &&
  have.energy >= need.energy &&
  have.manpower >= need.manpower

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export function newPlanet(name: string, type: PlanetType, population: number, baseIncome: ResourceSet): Planet {
  return { id: newId(), name, type, population, baseIncome: { ...baseIncome }, facilities: [] }
}

export function newEmpire(name: string, homeworld: Planet, resources: ResourceSet, by: string): Empire {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name,
    turn: 1,
    resources: { ...resources },
    researched: [],
    planets: [homeworld],
    log: [],
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  }
}

/** Number of a given facility owned across the whole empire. */
export function countFacility(empire: Empire, facilityId: string): number {
  let n = 0
  for (const p of empire.planets) for (const f of p.facilities) if (f.facilityId === facilityId) n += f.count
  return n
}

/** Colonising a new world: rules under "Planet Types". */
export const COLONY_POPULATION = 50_000
export const HOMEWORLD_MIN_POPULATION = 500_000
export const COLONY_SETUP_COST: ResourceSet = { credits: 200_000, rawMats: 1_000, energy: 2_000, manpower: 5_000 }
