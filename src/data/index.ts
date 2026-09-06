import researchJson from './research.json'
import constructionJson from './construction.json'
import type { Advance, Facility } from './types'

export const ADVANCES = researchJson as Advance[]
export const FACILITIES = constructionJson as Facility[]

export const ADVANCE_BY_ID = new Map(ADVANCES.map((a) => [a.id, a]))
export const FACILITY_BY_ID = new Map(FACILITIES.map((f) => [f.id, f]))

/** Fields in sheet order. */
export const FIELDS = [...new Set(ADVANCES.map((a) => a.field))]

export * from './types'
export * from './planetTypes'
