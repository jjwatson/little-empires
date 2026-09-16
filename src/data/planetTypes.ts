import type { Facility, ResourceSet } from './types'

export type PlanetType = 'homeworld' | 'arid' | 'arctic' | 'barren' | 'space' | 'aquatic' | 'volcanic'

/**
 * Planet types. `unlockedBy` is the Colonisation advance that allows settling that kind of
 * world; Type I worlds match the homeworld and need no research (house rules, "Planet Types").
 */
export const PLANET_TYPES: { id: PlanetType; name: string; summary: string; unlockedBy?: string }[] = [
  {
    id: 'homeworld',
    name: 'Type I',
    summary: 'Matches the homeworld: no bonuses or penalties.',
    unlockedBy: 'colonisation-research'
  },
  {
    id: 'arid',
    name: 'Arid',
    summary: 'Solar generators double income. Farms half output, double costs.',
    unlockedBy: 'improved-arid-colonies'
  },
  {
    id: 'arctic',
    name: 'Arctic',
    summary: 'Buildings cost 20% less Raw Mats. Cannot build Geothermal.',
    unlockedBy: 'arctic-exploitation'
  },
  {
    id: 'barren',
    name: 'Barren',
    summary: 'Solid Fuel has no Raw Mat upkeep. Mining +20% Raw Mats. No farms.',
    unlockedBy: 'barren-world-colonisation',
  },
  {
    id: 'space',
    name: 'Space Colony',
    summary: 'Ship factories +20% output. Only small factories; many ground buildings barred.',
    unlockedBy: 'space-colonisation',
  },
  { id: 'aquatic', name: 'Aquatic', summary: 'Hydroelectric half cost to build, double output.', unlockedBy: 'aquatic-colonies' },
  {
    id: 'volcanic',
    name: 'Volcanic',
    summary: 'Mining double positive output. Geothermal half cost, no Raw Mat upkeep. Farms half output, double costs.',
    unlockedBy: 'volcanic-exploitation',
  },
]

const MINING = new Set([
  'mineral-extractor',
  'automated-mining-facilities',
  'fuel-extractors',
  'refinery',
  'small-mining-outpost',
  'medium-mining-outpost',
  'large-mining-outpost',
])
const FARMS = new Set(['farms', 'automated-farms'])

const CANNOT_BUILD: Record<PlanetType, Set<string>> = {
  homeworld: new Set(),
  arid: new Set(),
  arctic: new Set(['geothermal-generators']),
  barren: new Set(['farms', 'automated-farms']),
  space: new Set([
    'geothermal-generators',
    'wind-power-generator',
    'hydroelectric-power-generators',
    'farms',
    'automated-farms',
    'mineral-extractor',
    'automated-mining-facilities',
    'fuel-extractors',
    'refinery',
    'ground-based-hangers',
    'planetary-shields',
    'overlapping-planetary-shields',
  ]),
  aquatic: new Set(),
  volcanic: new Set(),
}

/** Space colonies are limited to Small factories of non-ship types. */
function barredOnSpaceColony(f: Facility): boolean {
  const isFactory = /factory|manufacturing plant/i.test(f.name)
  const isShipFactory = /starfighter|capital ship/i.test(f.name)
  return isFactory && !isShipFactory && !/^small /i.test(f.name)
}

export function canBuildOnPlanet(type: PlanetType, f: Facility): boolean {
  if (CANNOT_BUILD[type].has(f.id)) return false
  if (type === 'space' && barredOnSpaceColony(f)) return false
  return true
}

const scale = (r: ResourceSet, fn: (v: number, k: keyof ResourceSet) => number): ResourceSet => ({
  credits: fn(r.credits, 'credits'),
  rawMats: fn(r.rawMats, 'rawMats'),
  energy: fn(r.energy, 'energy'),
  manpower: fn(r.manpower, 'manpower'),
})
const positives = (m: number) => (v: number) => (v > 0 ? v * m : v)
const negatives = (m: number) => (v: number) => (v < 0 ? v * m : v)
const noRawMatUpkeep = (v: number, k: keyof ResourceSet) => (k === 'rawMats' && v < 0 ? 0 : v)

/** Build cost of a facility on a given planet type. */
export function facilityCostOn(type: PlanetType, f: Facility): ResourceSet {
  let c = f.cost
  if (type === 'arctic') c = scale(c, (v, k) => (k === 'rawMats' ? Math.round(v * 0.8) : v))
  if (type === 'aquatic' && f.id === 'hydroelectric-power-generators') c = scale(c, (v) => v / 2)
  if (type === 'volcanic' && f.id === 'geothermal-generators') c = scale(c, (v) => v / 2)
  return c
}

/** Monthly income of one facility on a given planet type. */
export function facilityIncomeOn(type: PlanetType, f: Facility): ResourceSet {
  let inc = f.income
  switch (type) {
    case 'arid':
      if (f.id === 'solar-power-generator') inc = scale(inc, positives(2))
      if (FARMS.has(f.id)) inc = scale(scale(inc, positives(0.5)), negatives(2))
      break
    case 'barren':
      if (f.id === 'solid-fuel-power-generator') inc = scale(inc, noRawMatUpkeep)
      if (MINING.has(f.id)) inc = scale(inc, (v, k) => (k === 'rawMats' && v > 0 ? v * 1.2 : v))
      break
    case 'aquatic':
      if (f.id === 'hydroelectric-power-generators') inc = scale(inc, positives(2))
      break
    case 'volcanic':
      if (MINING.has(f.id)) inc = scale(inc, positives(2))
      if (f.id === 'geothermal-generators') inc = scale(inc, noRawMatUpkeep)
      if (FARMS.has(f.id)) inc = scale(scale(inc, positives(0.5)), negatives(2))
      break
  }
  return inc
}
