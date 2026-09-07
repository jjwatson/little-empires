import type { Facility } from './types'

/** Facility groupings in the order the tracking sheet's Resources tab lists them. */
export const FACILITY_CATEGORIES = [
  'Research Facilities',
  'Power Facilities',
  'Farming Facilities',
  'Mining Facilities',
  'Training Facilities',
  'Droids',
  'Computers',
  'Vehicles',
  'Fabrication',
  'Weapons',
  'Starfighters',
  'Capital Ships',
  'Space Stations',
  'Defences',
  'Commerce',
  'Other Facilities',
] as const
export type FacilityCategory = (typeof FACILITY_CATEGORIES)[number]

const RULES: [RegExp, FacilityCategory][] = [
  [/research lab/i, 'Research Facilities'],
  [/generator/i, 'Power Facilities'],
  [/farm/i, 'Farming Facilities'],
  [/mining|extractor|refinery|barge/i, 'Mining Facilities'],
  [/boot camp/i, 'Training Facilities'],
  [/droid factory/i, 'Droids'],
  [/computer|ship board ai|holoprojector/i, 'Computers'],
  [/repulsorlift factory|walker factory/i, 'Vehicles'],
  [/fabrication/i, 'Fabrication'],
  [/weapons manufacturing/i, 'Weapons'],
  [/starfighter factory/i, 'Starfighters'],
  [/capital ship dock|ship yards/i, 'Capital Ships'],
  [/space station|military station|orbital hangers|satellite/i, 'Space Stations'],
  [/shield|proximity mines|hangers|sensor net|military outpost/i, 'Defences'],
  [/trade|embassy/i, 'Commerce'],
]

export function facilityCategory(f: Facility): FacilityCategory {
  for (const [re, cat] of RULES) if (re.test(f.name)) return cat
  return 'Other Facilities'
}
