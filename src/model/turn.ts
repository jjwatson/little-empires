import {
  ADVANCE_BY_ID,
  BLUEPRINT_COSTS,
  FACILITIES,
  FACILITY_BY_ID,
  canBuildOnPlanet,
  facilityCostOn,
  facilityIncomeOn,
  PLANET_TYPES,
} from '../data'
import type { Advance, BlueprintScale, Facility, PlanetType, ResourceSet } from '../data'
import {
  COLONY_POPULATION,
  COLONY_SETUP_COST,
  HOMEWORLD_MIN_POPULATION,
  ZERO,
  add,
  addFacility,
  countFacility,
  covers,
  mul,
  neg,
  newId,
  newPlanet,
  planetHas,
  sub,
} from './empire'
import type { Empire, LedgerLine, Planet } from './empire'
import { line } from './ledger'
import { isGovernmentSystem } from './modifiers'
import { CREDITS_PER_HEAD, grow, growthRate, takePopulation, withSpecies } from './population'
import { advanceStatus, prereqMet } from './prereqs'

export interface BuildAction {
  planetId: string
  facilityId: string
}

export interface BlueprintAction {
  name: string
  scale: BlueprintScale
}

export interface TurnActions {
  research: string[]
  builds: BuildAction[]
  blueprints: BlueprintAction[]
  /** Where each free prototype granted by this turn's research should be placed: facilityId -> planetId. */
  prototypes: Record<string, string>
}

export const EMPTY_ACTIONS: TurnActions = { research: [], builds: [], blueprints: [], prototypes: {} }

export const RESEARCH_LABS = ['small-research-lab', 'large-research-lab', 'orbital-research-lab']

/** GM ruling 2026-09-07: every research lab adds a slot, and each kind can be built once per planet. */
export const oncePerPlanet = (facilityId: string): boolean => RESEARCH_LABS.includes(facilityId)

export function researchFacilities(empire: Empire): number {
  return RESEARCH_LABS.reduce((n, id) => n + countFacility(empire, id), 0)
}

/** 1 base + one per research lab + one for Computer Assisted Research. */
export function researchSlots(empire: Empire): number {
  return 1 + researchFacilities(empire) + (empire.researched.includes('computer-assisted-research') ? 1 : 0)
}

/** Reverse Engineering: one blueprint per research facility per turn. */
export function blueprintSlots(empire: Empire): number {
  return empire.researched.includes('reverse-engineering') ? researchFacilities(empire) : 0
}

/**
 * GM ruling 2026-09-07: completing the research for a building hands you one working prototype,
 * its cost being included in the research. A facility qualifies when this turn's research is what
 * completes its prerequisites.
 */
export function prototypesFor(empire: Empire, research: string[]): Facility[] {
  if (!research.length) return []
  const before = new Set(empire.researched)
  const after = new Set([...before, ...research])
  const candidates = FACILITIES.filter(
    (f) =>
      f.requires.all?.length &&
      !f.requires.any &&
      f.requires.all.some((id) => research.includes(id)) &&
      prereqMet(f.requires, after) &&
      !prereqMet(f.requires, before),
  )
  // Where one advance unlocks several sizes of a building (the sheet lists Small/Medium/Large
  // walker factories all under "Small Walker Factory Blueprints"), the prototype is the one
  // the research is named for.
  const groups = new Map<string, Facility[]>()
  for (const f of candidates) {
    const key = f.requires.all!.filter((id) => research.includes(id)).join('+')
    groups.set(key, [...(groups.get(key) ?? []), f])
  }
  const out: Facility[] = []
  for (const [key, group] of groups) {
    if (group.length === 1) {
      out.push(group[0])
      continue
    }
    const advanceWords = words(key.split('+').map((id) => ADVANCE_BY_ID.get(id)?.name ?? id).join(' '))
    const scored = group.map((f) => ({ f, score: [...words(f.name)].filter((w) => advanceWords.has(w)).length }))
    const best = Math.max(...scored.map((s) => s.score))
    out.push(...scored.filter((s) => s.score === best).map((s) => s.f))
  }
  return out
}

const words = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !['the', 'of', 'and', 'a', 'research', 'blueprints', 'facility', 'factory'].includes(w)),
  )

export const canHostPrototype = (planet: Planet, f: Facility): boolean =>
  canBuildOnPlanet(planet.type, f) && !(oncePerPlanet(f.id) && planetHas(planet, f.id))

/** The planet a prototype lands on: the chosen one if it can host it, else the first that can. */
export function prototypePlanet(empire: Empire, actions: TurnActions, f: Facility): Planet | undefined {
  const chosen = empire.planets.find((p) => p.id === actions.prototypes[f.id])
  if (chosen && canHostPrototype(chosen, f)) return chosen
  return empire.planets.find((p) => canHostPrototype(p, f))
}

/** Credits the planet's population generates this turn (rate applied first, as in the sheet). */
export function populationCredits(planet: Planet, rate: number): number {
  return planet.population * (1 + rate) * CREDITS_PER_HEAD
}

/** Income generated each turn by a single planet: population credits + GM base + finished facilities. */
export function planetIncome(planet: Planet, rate: number): ResourceSet {
  let total = add(planet.baseIncome, { ...ZERO, credits: populationCredits(planet, rate) })
  for (const owned of planet.facilities) {
    const f = FACILITY_BY_ID.get(owned.facilityId)
    if (f) total = add(total, mul(facilityIncomeOn(planet.type, f), owned.count))
  }
  return total
}

export function projectedIncome(empire: Empire): ResourceSet {
  return empire.planets.reduce((acc, p) => add(acc, planetIncome(p, growthRate(empire, p))), ZERO)
}

export function blueprintCost(actions: TurnActions): ResourceSet {
  return actions.blueprints.reduce((acc, b) => add(acc, BLUEPRINT_COSTS[b.scale]), ZERO)
}

export function actionCost(empire: Empire, actions: TurnActions): ResourceSet {
  let total = ZERO
  for (const id of actions.research) {
    const a = ADVANCE_BY_ID.get(id)
    if (a) total = add(total, a.cost)
  }
  for (const b of actions.builds) {
    const f = FACILITY_BY_ID.get(b.facilityId)
    const p = empire.planets.find((x) => x.id === b.planetId)
    if (f && p) total = add(total, facilityCostOn(p.type, f))
  }
  return add(total, blueprintCost(actions))
}

export function validateActions(empire: Empire, actions: TurnActions): string[] {
  const errors: string[] = []
  const researched = new Set(empire.researched)

  const slots = researchSlots(empire)
  if (actions.research.length > slots) errors.push(`Only ${slots} research slot(s) available this turn.`)
  if (new Set(actions.research).size !== actions.research.length) errors.push('Duplicate research selected.')
  for (const id of actions.research) {
    const a = ADVANCE_BY_ID.get(id)
    if (!a) errors.push(`Unknown advance ${id}.`)
    else if (advanceStatus(a, researched) !== 'available') errors.push(`${a.name} is not available to research.`)
  }

  const bpSlots = blueprintSlots(empire)
  if (actions.blueprints.length > bpSlots) {
    errors.push(
      bpSlots === 0
        ? 'Blueprints need Reverse Engineering and at least one research lab.'
        : `Only ${bpSlots} blueprint slot(s) available this turn.`,
    )
  }
  if (actions.blueprints.some((b) => !b.name.trim())) errors.push('Every blueprint needs a name.')

  const seenPlanets = new Set<string>()
  for (const b of actions.builds) {
    const p = empire.planets.find((x) => x.id === b.planetId)
    const f = FACILITY_BY_ID.get(b.facilityId)
    if (!p) {
      errors.push(`Unknown planet ${b.planetId}.`)
      continue
    }
    if (seenPlanets.has(p.id)) errors.push(`${p.name} can only build one facility per turn.`)
    seenPlanets.add(p.id)
    if (p.inProgress) errors.push(`${p.name} is still building ${FACILITY_BY_ID.get(p.inProgress.facilityId)?.name}.`)
    if (!f) errors.push(`Unknown facility ${b.facilityId}.`)
    else {
      if (!prereqMet(f.requires, researched)) errors.push(`${f.name} has unmet research prerequisites.`)
      if (!canBuildOnPlanet(p.type, f)) errors.push(`${f.name} cannot be built on a ${p.type} planet.`)
      if (oncePerPlanet(f.id) && planetHas(p, f.id)) errors.push(`${p.name} already has a ${f.name}; only one per planet.`)
    }
  }

  const cost = actionCost(empire, actions)
  if (!covers(empire.resources, cost)) errors.push('Not enough resources for the selected actions.')
  return errors
}

/**
 * Resolve a colony turn: pay for actions, grow the population, apply income from what already
 * exists, progress construction, place prototypes, write the ledger and advance the counter.
 * Returns a new Empire; the input is not mutated. Throws if the actions are invalid.
 */
export function endTurn(empire: Empire, actions: TurnActions, by: string, notes?: string): Empire {
  const errors = validateActions(empire, actions)
  if (errors.length) throw new Error(errors.join(' '))

  const at = new Date().toISOString()
  const turn = empire.turn
  const spent = actionCost(empire, actions)
  const income = projectedIncome(empire)
  const lines: LedgerLine[] = []

  lines.push(line(turn, 'income', `Income CT ${turn}`, income, by, at, { notes }))

  for (const id of actions.research) {
    const a = ADVANCE_BY_ID.get(id)!
    lines.push(line(turn, 'research', a.name, neg(a.cost), by, at))
  }

  const blueprints = actions.blueprints.map((b) => {
    lines.push(line(turn, 'blueprint', `Blueprint: ${b.name.trim()} (${b.scale})`, neg(BLUEPRINT_COSTS[b.scale]), by, at))
    return { id: newId(), name: b.name.trim(), scale: b.scale, turn }
  })

  let planets = empire.planets.map((p) => {
    let planet: Planet = grow({ ...p, facilities: p.facilities.map((f) => ({ ...f })) }, growthRate(empire, p))
    const build = actions.builds.find((b) => b.planetId === p.id)
    if (build) {
      const f = FACILITY_BY_ID.get(build.facilityId)!
      planet.inProgress = { facilityId: f.id, turnsLeft: f.buildTime ?? 1 }
      lines.push(line(turn, 'construction', f.name, neg(facilityCostOn(p.type, f)), by, at, { planetId: p.id }))
    }
    if (planet.inProgress) {
      const left = planet.inProgress.turnsLeft - 1
      if (left <= 0) {
        planet = addFacility(planet, planet.inProgress.facilityId)
        delete planet.inProgress
      } else {
        planet.inProgress = { ...planet.inProgress, turnsLeft: left }
      }
    }
    return planet
  })

  const working = { ...empire, planets }
  for (const f of prototypesFor(empire, actions.research)) {
    const target = prototypePlanet(working, actions, f)
    if (!target) continue
    planets = planets.map((p) => (p.id === target.id ? addFacility(p, f.id) : p))
    working.planets = planets
    lines.push(line(turn, 'prototype', `Prototype: ${f.name}`, ZERO, by, at, { planetId: target.id }))
  }

  const researched = [...empire.researched, ...actions.research]
  let government = empire.government
  if (!government) {
    const first = actions.research.map((id) => ADVANCE_BY_ID.get(id)!).find(isGovernmentSystem)
    if (first) government = first.id
  }

  return {
    ...empire,
    turn: turn + 1,
    resources: add(sub(empire.resources, spent), income),
    researched,
    government,
    blueprints: [...empire.blueprints, ...blueprints],
    planets,
    ledger: [...empire.ledger, ...lines],
    updatedAt: at,
    updatedBy: by,
  }
}

/** The Colonisation advance still needed before this kind of world can be settled, if any. */
export function planetTypeLock(type: PlanetType, researched: ReadonlySet<string>): Advance | undefined {
  const needs = PLANET_TYPES.find((t) => t.id === type)?.unlockedBy
  return needs && !researched.has(needs) ? ADVANCE_BY_ID.get(needs) : undefined
}

/** Why a colony cannot be founded right now; empty when it can. Pass the type to check its research. */
export function colonyProblems(empire: Empire, type?: PlanetType): string[] {
  const problems: string[] = []
  const home = empire.planets[0]
  if (!covers(empire.resources, COLONY_SETUP_COST)) problems.push('Not enough resources for the setup cost.')
  if (home.population - COLONY_POPULATION < HOMEWORLD_MIN_POPULATION)
    problems.push('Homeworld population would fall too low.')
  if (type) {
    const lock = planetTypeLock(type, new Set(empire.researched))
    if (lock) problems.push(`Settling ${PLANET_TYPES.find((t) => t.id === type)?.name ?? type} worlds needs ${lock.name}.`)
  }
  return problems
}

/** Found a colony: pay the setup cost, move 50,000 people off the homeworld, write the ledger line. */
export function foundColony(empire: Empire, name: string, type: PlanetType, baseIncome: ResourceSet, by: string): Empire {
  const problems = colonyProblems(empire, type)
  if (problems.length) throw new Error(problems.join(' '))
  const at = new Date().toISOString()
  const { planet: home, movers } = takePopulation(empire.planets[0], COLONY_POPULATION)
  const colony = withSpecies(newPlanet(name, type, COLONY_POPULATION, baseIncome), movers)
  return {
    ...empire,
    resources: sub(empire.resources, COLONY_SETUP_COST),
    planets: [home, ...empire.planets.slice(1), colony],
    ledger: [...empire.ledger, line(empire.turn, 'colony', `Founded ${name}`, neg(COLONY_SETUP_COST), by, at, { planetId: colony.id })],
    updatedAt: at,
    updatedBy: by,
  }
}
