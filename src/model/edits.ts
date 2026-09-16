import { ADVANCE_BY_ID, FACILITY_BY_ID, PLANET_TYPES, canBuildOnPlanet } from '../data'
import type { BlueprintScale, PlanetType, ResourceSet } from '../data'
import { ZERO, add, addCustomFacility, addFacility, isHomeworld, newId, newPlanet, planetHas, removeFacility } from './empire'
import type { CustomFacility, Empire, Planet } from './empire'
import { describeFacility } from './facilities'
import { line } from './ledger'
import { oncePerPlanet } from './turn'

/**
 * GM edits: changes made because of what happened in the roleplaying game rather than through
 * the build / research / colonisation rules. Every edit is free unless a stockpile change is
 * given, and every edit writes an 'event' ledger line so the history stays complete.
 */

export interface EditNote {
  /** Why it happened, in the players' words. Becomes the ledger label. */
  label: string
  /** Optional change to the stockpile (negative to spend). */
  delta?: ResourceSet
  notes?: string
}

const typeName = (type: PlanetType): string => PLANET_TYPES.find((t) => t.id === type)?.name ?? type
const times = (n: number): string => (n > 1 ? ` ×${n}` : '')

function planetOf(empire: Empire, planetId: string): Planet {
  const p = empire.planets.find((x) => x.id === planetId)
  if (!p) throw new Error(`Unknown planet ${planetId}.`)
  return p
}

const replacePlanet = (empire: Empire, next: Planet): Planet[] => empire.planets.map((p) => (p.id === next.id ? next : p))

/** Apply `changes`, move the stockpile by the note's delta and append one 'event' line. */
function recordEvent(empire: Empire, changes: Partial<Empire>, note: EditNote, by: string, summary: string, planetId?: string): Empire {
  const at = new Date().toISOString()
  const delta = note.delta ?? ZERO
  const notes = [summary, note.notes?.trim()].filter(Boolean).join(' · ')
  return {
    ...empire,
    ...changes,
    resources: add(empire.resources, delta),
    ledger: [...empire.ledger, line(empire.turn, 'event', note.label.trim(), delta, by, at, { planetId, notes })],
    updatedAt: at,
    updatedBy: by,
  }
}

// --- facilities --------------------------------------------------------------------------

/** Things the rules would normally stop; a GM edit goes ahead anyway, so these are only warnings. */
export function facilityWarnings(planet: Planet, facilityId: string): string[] {
  const f = FACILITY_BY_ID.get(facilityId)
  if (!f) return []
  const out: string[] = []
  if (!canBuildOnPlanet(planet.type, f)) out.push(`${f.name} cannot normally be built on a ${typeName(planet.type)} world.`)
  if (oncePerPlanet(f.id) && planetHas(planet, f.id)) out.push(`${planet.name} already has a ${f.name}; normally one per planet.`)
  return out
}

export function grantFacility(empire: Empire, planetId: string, facilityId: string, count: number, note: EditNote, by: string): Empire {
  const f = FACILITY_BY_ID.get(facilityId)
  if (!f) throw new Error(`Unknown facility ${facilityId}.`)
  let planet = planetOf(empire, planetId)
  for (let i = 0; i < count; i++) planet = addFacility(planet, facilityId)
  return recordEvent(empire, { planets: replacePlanet(empire, planet) }, note, by, `Added ${f.name}${times(count)} on ${planet.name}`, planetId)
}

/** Take some (or, with `count` omitted, all) of a facility away. */
export function reduceFacility(empire: Empire, planetId: string, facilityId: string, count: number | undefined, note: EditNote, by: string): Empire {
  const planet = planetOf(empire, planetId)
  const owned = planet.facilities.find((f) => f.facilityId === facilityId)
  if (!owned) throw new Error(`${planet.name} has no such facility.`)
  const n = count === undefined ? owned.count : Math.min(count, owned.count)
  const name = describeFacility(owned)?.name ?? facilityId
  const next = removeFacility(planet, facilityId, n)
  return recordEvent(empire, { planets: replacePlanet(empire, next) }, note, by, `Removed ${name}${times(n)} from ${planet.name}`, planetId)
}

export function grantCustomFacility(empire: Empire, planetId: string, custom: CustomFacility, count: number, note: EditNote, by: string): Empire {
  const planet = planetOf(empire, planetId)
  const next = addCustomFacility(planet, custom, count)
  return recordEvent(empire, { planets: replacePlanet(empire, next) }, note, by, `Added ${custom.name}${times(count)} on ${planet.name}`, planetId)
}

export function updateCustomFacility(empire: Empire, planetId: string, facilityId: string, custom: CustomFacility, note: EditNote, by: string): Empire {
  const planet = planetOf(empire, planetId)
  if (!planet.facilities.some((f) => f.facilityId === facilityId && f.custom)) throw new Error(`${planet.name} has no such custom facility.`)
  const next = { ...planet, facilities: planet.facilities.map((f) => (f.facilityId === facilityId ? { ...f, custom } : f)) }
  return recordEvent(empire, { planets: replacePlanet(empire, next) }, note, by, `Changed ${custom.name} on ${planet.name}`, planetId)
}

/** Abandon a build still in progress. Nothing is refunded unless the note says so. */
export function cancelBuild(empire: Empire, planetId: string, note: EditNote, by: string): Empire {
  const planet = planetOf(empire, planetId)
  if (!planet.inProgress) throw new Error(`${planet.name} is not building anything.`)
  const name = FACILITY_BY_ID.get(planet.inProgress.facilityId)?.name ?? planet.inProgress.facilityId
  const next = { ...planet }
  delete next.inProgress
  return recordEvent(empire, { planets: replacePlanet(empire, next) }, note, by, `Cancelled building ${name} on ${planet.name}`, planetId)
}

// --- planets -----------------------------------------------------------------------------

/** Add a world the empire already holds: no setup cost, nobody moved, no research needed. */
export function grantPlanet(
  empire: Empire,
  name: string,
  type: PlanetType,
  population: number,
  baseIncome: ResourceSet,
  note: EditNote,
  by: string,
): Empire {
  const planet = newPlanet(name.trim(), type, population, baseIncome)
  return recordEvent(empire, { planets: [...empire.planets, planet] }, note, by, `Added ${planet.name} (${typeName(type)})`, planet.id)
}

/** Lose a colony and everyone on it. The homeworld cannot be removed. */
export function removePlanet(empire: Empire, planetId: string, note: EditNote, by: string): Empire {
  if (isHomeworld(empire, planetId)) throw new Error('The homeworld cannot be removed.')
  const planet = planetOf(empire, planetId)
  return recordEvent(
    empire,
    {
      planets: empire.planets.filter((p) => p.id !== planetId),
      formerPlanets: [...(empire.formerPlanets ?? []), { id: planet.id, name: planet.name }],
    },
    note,
    by,
    `Removed ${planet.name}, population ${Math.round(planet.population).toLocaleString()}`,
    planetId,
  )
}

// --- research ----------------------------------------------------------------------------

export function grantAdvance(empire: Empire, advanceId: string, note: EditNote, by: string): Empire {
  const a = ADVANCE_BY_ID.get(advanceId)
  if (!a) throw new Error(`Unknown advance ${advanceId}.`)
  if (empire.researched.includes(advanceId)) throw new Error(`${a.name} is already researched.`)
  return recordEvent(empire, { researched: [...empire.researched, advanceId] }, note, by, `Granted ${a.name}`)
}

/** Forget an advance. Anything that depended on it stays but shows as locked; no cascade. */
export function revokeAdvance(empire: Empire, advanceId: string, note: EditNote, by: string): Empire {
  const a = ADVANCE_BY_ID.get(advanceId)
  if (!a) throw new Error(`Unknown advance ${advanceId}.`)
  if (!empire.researched.includes(advanceId)) throw new Error(`${a.name} is not researched.`)
  return recordEvent(
    empire,
    { researched: empire.researched.filter((id) => id !== advanceId), government: empire.government === advanceId ? undefined : empire.government },
    note,
    by,
    `Revoked ${a.name}`,
  )
}

// --- blueprints --------------------------------------------------------------------------

export function grantBlueprint(empire: Empire, name: string, scale: BlueprintScale, note: EditNote, by: string): Empire {
  const blueprint = { id: newId(), name: name.trim(), scale, turn: empire.turn }
  return recordEvent(empire, { blueprints: [...empire.blueprints, blueprint] }, note, by, `Gained blueprint: ${blueprint.name} (${scale})`)
}

export function removeBlueprint(empire: Empire, blueprintId: string, note: EditNote, by: string): Empire {
  const b = empire.blueprints.find((x) => x.id === blueprintId)
  if (!b) throw new Error('No such blueprint.')
  return recordEvent(empire, { blueprints: empire.blueprints.filter((x) => x.id !== blueprintId) }, note, by, `Lost blueprint: ${b.name} (${b.scale})`)
}
