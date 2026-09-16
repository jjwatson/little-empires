import { FACILITY_BY_ID, facilityCategory, facilityIncomeOn } from '../data'
import type { Facility, FacilityCategory, PlanetType, ResourceSet } from '../data'
import { ZERO } from './empire'
import type { OwnedFacility } from './empire'

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

/** Per-unit monthly yield of an owned facility on a planet of the given type. */
export function ownedIncome(type: PlanetType, owned: OwnedFacility): ResourceSet {
  if (owned.custom) return owned.custom.income
  const f = FACILITY_BY_ID.get(owned.facilityId)
  return f ? facilityIncomeOn(type, f) : ZERO
}
