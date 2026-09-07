export type ResourceKey = 'credits' | 'rawMats' | 'energy' | 'manpower'
export const RESOURCE_KEYS: ResourceKey[] = ['credits', 'rawMats', 'energy', 'manpower']
export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  credits: 'Credits',
  rawMats: 'Raw Mats',
  energy: 'Energy',
  manpower: 'Manpower',
}

export interface ResourceSet {
  credits: number
  rawMats: number
  energy: number
  manpower: number
}

/** Prerequisites expressed as advance ids. `anyCount` = how many of `any` are needed (default 1). */
export interface Prereq {
  all?: string[]
  any?: string[]
  anyCount?: number
  note?: string
}

export interface Advance {
  id: string
  name: string
  field: string
  tier: number
  /** Researching this unlocks the given tier within its own field. */
  unlocksTier?: number
  effects: string
  notes?: string
  cost: ResourceSet
  prereq: Prereq
}

export interface Facility {
  id: string
  name: string
  effects: string
  notes?: string
  cost: ResourceSet
  /** Colony turns to build; undefined = completes at the end of the turn it is started. */
  buildTime?: number
  /** Monthly (per colony turn) change to the stockpile once built. */
  income: ResourceSet
  requires: Prereq
}

/** Reverse Engineering: blueprint cost by item scale (house-rules table; the sheet's 10-Energy Character row is a typo). */
export const BLUEPRINT_SCALES = ['Character', 'Droid', 'Speeder', 'Walker', 'Starfighter', 'Capital'] as const
export type BlueprintScale = (typeof BLUEPRINT_SCALES)[number]
export const BLUEPRINT_COSTS: Record<BlueprintScale, ResourceSet> = {
  Character: { credits: 500, rawMats: 10, energy: 100, manpower: 100 },
  Droid: { credits: 1_000, rawMats: 20, energy: 200, manpower: 200 },
  Speeder: { credits: 1_000, rawMats: 20, energy: 200, manpower: 200 },
  Walker: { credits: 5_000, rawMats: 100, energy: 1_000, manpower: 1_000 },
  Starfighter: { credits: 10_000, rawMats: 200, energy: 2_000, manpower: 2_000 },
  Capital: { credits: 100_000, rawMats: 2_000, energy: 20_000, manpower: 20_000 },
}
