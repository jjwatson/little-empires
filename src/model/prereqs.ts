import { ADVANCES, ADVANCE_BY_ID, FACILITIES, canBuildOnPlanet } from '../data'
import type { Advance, Facility, Prereq } from '../data'
import type { Empire, Planet } from './empire'

export function prereqMet(p: Prereq, researched: ReadonlySet<string>): boolean {
  if (p.all && !p.all.every((id) => researched.has(id))) return false
  if (p.any) {
    const hits = p.any.filter((id) => researched.has(id)).length
    if (hits < (p.anyCount ?? 1)) return false
  }
  return true
}

/** Tiers within a field that some advance explicitly unlocks. Anything else is ungated. */
const GATED_TIERS = new Map<string, Set<number>>()
for (const a of ADVANCES) {
  if (!a.unlocksTier) continue
  if (!GATED_TIERS.has(a.field)) GATED_TIERS.set(a.field, new Set())
  GATED_TIERS.get(a.field)!.add(a.unlocksTier)
}

/** Highest tier unlocked in a field by the researched set (tier 1 is always open). */
export function unlockedTier(field: string, researched: ReadonlySet<string>): number {
  let t = 1
  for (const id of researched) {
    const a = ADVANCE_BY_ID.get(id)
    if (a && a.field === field && a.unlocksTier && a.unlocksTier > t) t = a.unlocksTier
  }
  return t
}

/**
 * An advance is reachable once its field has been unlocked up to the highest
 * gated tier at or below its own tier. Fields with no "Unlocks Tier N" advances
 * (e.g. Civics) rely on prerequisites alone.
 */
export function tierOpen(a: Advance, researched: ReadonlySet<string>): boolean {
  const gated = GATED_TIERS.get(a.field)
  if (!gated) return true
  const required = Math.max(1, ...[...gated].filter((t) => t <= a.tier))
  return unlockedTier(a.field, researched) >= required
}

export type AdvanceStatus = 'researched' | 'available' | 'locked'

export function advanceStatus(a: Advance, researched: ReadonlySet<string>): AdvanceStatus {
  if (researched.has(a.id)) return 'researched'
  return prereqMet(a.prereq, researched) && tierOpen(a, researched) ? 'available' : 'locked'
}

export function availableResearch(empire: Empire): Advance[] {
  const r = new Set(empire.researched)
  return ADVANCES.filter((a) => advanceStatus(a, r) === 'available')
}

export function availableBuilds(empire: Empire, planet: Planet): Facility[] {
  const r = new Set(empire.researched)
  return FACILITIES.filter((f) => prereqMet(f.requires, r) && canBuildOnPlanet(planet.type, f))
}

/** Human-readable list of what is still missing for an advance or facility. */
export function missingPrereqs(p: Prereq, researched: ReadonlySet<string>): string[] {
  const out: string[] = []
  for (const id of p.all ?? []) if (!researched.has(id)) out.push(ADVANCE_BY_ID.get(id)?.name ?? id)
  if (p.any) {
    const hits = p.any.filter((id) => researched.has(id)).length
    const need = p.anyCount ?? 1
    if (hits < need) {
      const names = p.any.map((id) => ADVANCE_BY_ID.get(id)?.name ?? id)
      out.push(`${need > 1 ? `${need} of` : 'one of'}: ${names.join(', ')}`)
    }
  }
  return out
}
