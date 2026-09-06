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
