import type { Empire, Planet, Species } from './empire'
import { populationGrowthBonus } from './modifiers'

/** Every colony grows 1% per colony turn before bonuses (tracking sheet: Monarchy's +1% gives "Total 2%"). */
export const BASE_GROWTH = 0.01
/** Base credit income is one credit per ten population, taken after this turn's growth. */
export const CREDITS_PER_HEAD = 0.1

export function growthRate(empire: Empire, planet: Planet): number {
  return BASE_GROWTH + populationGrowthBonus(empire) + planet.growthAdjust
}

export const sumSpecies = (species: Species[]): number => species.reduce((n, s) => n + s.population, 0)

/** Replace the species table and keep the total in step with it. */
export function withSpecies(planet: Planet, species: Species[]): Planet {
  return { ...planet, species, population: species.length ? sumSpecies(species) : planet.population }
}

/** Population after one turn of growth. Fractions are kept, as the sheet does; display rounds. */
export function grow(planet: Planet, rate: number): Planet {
  if (planet.species.length) {
    const species = planet.species.map((s) => ({ ...s, population: s.population * (1 + rate) }))
    return { ...planet, species, population: sumSpecies(species) }
  }
  return { ...planet, population: planet.population * (1 + rate) }
}

/** Remove `n` people from a planet proportionally across its species; returns the reduced planet and the movers. */
export function takePopulation(planet: Planet, n: number): { planet: Planet; movers: Species[] } {
  if (!planet.species.length) return { planet: { ...planet, population: planet.population - n }, movers: [] }
  const share = n / planet.population
  const movers = planet.species.map((s) => ({ name: s.name, population: s.population * share }))
  const species = planet.species.map((s) => ({ ...s, population: s.population * (1 - share) }))
  return { planet: withSpecies(planet, species), movers }
}
