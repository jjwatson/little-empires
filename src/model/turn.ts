import { ADVANCE_BY_ID, FACILITY_BY_ID, facilityCostOn, facilityIncomeOn, canBuildOnPlanet } from '../data'
import type { ResourceSet } from '../data'
import { add, sub, mul, covers, countFacility, ZERO } from './empire'
import type { Empire, Planet, TurnEntry } from './empire'
import { advanceStatus, prereqMet } from './prereqs'

export interface BuildAction {
  planetId: string
  facilityId: string
}

export interface TurnActions {
  research: string[]
  builds: BuildAction[]
}

/** 1 base + one per Large / Orbital Research Lab + one for Computer Assisted Research. */
export function researchSlots(empire: Empire): number {
  let n = 1
  n += countFacility(empire, 'large-research-lab')
  n += countFacility(empire, 'orbital-research-lab')
  if (empire.researched.includes('computer-assisted-research')) n += 1
  return n
}

/** Income generated each turn by a single planet (base + finished facilities). */
export function planetIncome(planet: Planet): ResourceSet {
  let total = planet.baseIncome
  for (const owned of planet.facilities) {
    const f = FACILITY_BY_ID.get(owned.facilityId)
    if (f) total = add(total, mul(facilityIncomeOn(planet.type, f), owned.count))
  }
  return total
}

export function projectedIncome(empire: Empire): ResourceSet {
  return empire.planets.reduce((acc, p) => add(acc, planetIncome(p)), ZERO)
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
  return total
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
    }
  }

  const cost = actionCost(empire, actions)
  if (!covers(empire.resources, cost)) errors.push('Not enough resources for the selected actions.')
  return errors
}

/**
 * Resolve a colony turn: pay for actions, apply income from what already exists,
 * progress construction, record the log entry and advance the counter.
 * Returns a new Empire; the input is not mutated. Throws if the actions are invalid.
 */
export function endTurn(empire: Empire, actions: TurnActions, by: string, notes?: string): Empire {
  const errors = validateActions(empire, actions)
  if (errors.length) throw new Error(errors.join(' '))

  const spent = actionCost(empire, actions)
  const income = projectedIncome(empire)
  const at = new Date().toISOString()

  const planets = empire.planets.map((p) => {
    let planet: Planet = { ...p, facilities: p.facilities.map((f) => ({ ...f })) }
    const build = actions.builds.find((b) => b.planetId === p.id)
    if (build) {
      const f = FACILITY_BY_ID.get(build.facilityId)!
      planet.inProgress = { facilityId: f.id, turnsLeft: f.buildTime ?? 1 }
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

  const entry: TurnEntry = {
    turn: empire.turn,
    at,
    by,
    researched: [...actions.research],
    builds: actions.builds.map((b) => ({ ...b })),
    spent,
    income,
    notes: notes || undefined,
  }

  return {
    ...empire,
    turn: empire.turn + 1,
    resources: add(sub(empire.resources, spent), income),
    researched: [...empire.researched, ...actions.research],
    planets,
    log: [...empire.log, entry],
    updatedAt: at,
    updatedBy: by,
  }
}

function addFacility(planet: Planet, facilityId: string): Planet {
  const facilities = planet.facilities.map((f) => ({ ...f }))
  const existing = facilities.find((f) => f.facilityId === facilityId)
  if (existing) existing.count += 1
  else facilities.push({ facilityId, count: 1 })
  return { ...planet, facilities }
}
