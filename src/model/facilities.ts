import { FACILITY_BY_ID, facilityCategory, facilityIncomeOn } from '../data'
import type { Facility, FacilityCategory, PlanetType, ResourceSet } from '../data'
import { ZERO } from './empire'
import type { BuildInProgress, CustomBuild, CustomFacility, OwnedFacility } from './empire'

/** What an owned facility is, whether it comes from the catalogue or was added by GM edit. */
export interface FacilityInfo {
  name: string
  notes?: string
  category: FacilityCategory
  /** The catalogue entry, absent for custom facilities. */
  catalogue?: Facility
  custom: boolean
}

/** Resolve an owned facility for display; undefined only for a dangling catalogue id. */
export function describeFacility(owned: OwnedFacility): FacilityInfo | undefined {
  if (owned.custom) return { name: owned.custom.name, notes: owned.custom.notes, category: 'Other Facilities', custom: true }
  const f = FACILITY_BY_ID.get(owned.facilityId)
  return f ? { name: f.name, notes: f.notes, category: facilityCategory(f), catalogue: f, custom: false } : undefined
}

/** Name of what a planet's construction slot is busy with, catalogue or custom. */
export function buildName(b: BuildInProgress): string {
  return b.custom?.name ?? FACILITY_BY_ID.get(b.facilityId)?.name ?? b.facilityId
}

/** Colony turns a build takes from start to finish. */
export function buildTurns(b: BuildInProgress): number {
  return b.custom?.turns ?? FACILITY_BY_ID.get(b.facilityId)?.buildTime ?? 1
}

/** The facility a finished Custom Build turns into: same name and notes, yielding its income a turn. */
export function finishedCustom(c: CustomBuild): CustomFacility {
  const out: CustomFacility = { name: c.name, income: c.income }
  if (c.notes) out.notes = c.notes
  return out
}

/** Per-unit monthly yield of an owned facility on a planet of the given type. */
export function ownedIncome(type: PlanetType, owned: OwnedFacility): ResourceSet {
  if (owned.custom) return owned.custom.income
  const f = FACILITY_BY_ID.get(owned.facilityId)
  return f ? facilityIncomeOn(type, f) : ZERO
}
