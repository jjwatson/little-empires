import { ADVANCE_BY_ID, ADVANCES } from '../data'
import type { Advance } from '../data'
import type { Empire } from './empire'

/** Governmental systems: "Can only have one System in operation at a time". */
export const isGovernmentSystem = (a: Advance): boolean => /one system in operation/i.test(a.notes ?? '')

export const GOVERNMENT_SYSTEMS = ADVANCES.filter(isGovernmentSystem)

/** Researched governmental systems the player may put in operation. */
export function governmentOptions(empire: Empire): Advance[] {
  return GOVERNMENT_SYSTEMS.filter((a) => empire.researched.includes(a.id))
}

/** Researched advances whose effects currently apply: everything except governments not in operation. */
export function activeAdvances(empire: Empire): Advance[] {
  const out: Advance[] = []
  for (const id of empire.researched) {
    const a = ADVANCE_BY_ID.get(id)
    if (!a) continue
    if (isGovernmentSystem(a) && a.id !== empire.government) continue
    out.push(a)
  }
  return out
}

export interface Bonus {
  source: string
  field: string
  effect: string
}

/** The "Bonuses from Research" table: one row per active advance whose effect is more than an unlock. */
export function activeBonuses(empire: Empire): Bonus[] {
  return activeAdvances(empire)
    .filter((a) => a.effects && !/^(unlocks?|allows?) /i.test(a.effects.trim()))
    .map((a) => ({ source: a.name, field: a.field, effect: a.effects }))
}

/** Sum of "Increase Population Growth by N%" across active advances, as a fraction. */
export function populationGrowthBonus(empire: Empire): number {
  let total = 0
  for (const a of activeAdvances(empire)) {
    const m = /population growth by (\d+(?:\.\d+)?)%/i.exec(a.effects)
    if (m) total += Number(m[1]) / 100
  }
  return total
}
