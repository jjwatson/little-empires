import { describe, expect, it } from 'vitest'
import { newEmpire, newPlanet } from './empire'
import type { Empire } from './empire'
import { endTurn, projectedIncome, researchSlots, validateActions } from './turn'
import { advanceStatus, availableBuilds, availableResearch, unlockedTier } from './prereqs'
import { ADVANCE_BY_ID, FACILITY_BY_ID } from '../data'

const base = { credits: 10_000, rawMats: 500, energy: 500, manpower: 500 }

function empire(overrides: Partial<Empire> = {}): Empire {
  const home = newPlanet('Home', 'homeworld', 1_000_000, base)
  const e = newEmpire('Test', home, { credits: 200_000, rawMats: 5_000, energy: 5_000, manpower: 5_000 }, 'tester')
  return { ...e, ...overrides }
}

describe('research availability', () => {
  it('starts with only the two tier-1 Research advances', () => {
    const ids = availableResearch(empire()).map((a) => a.id).sort()
    expect(ids).toEqual(['higher-education', 'infrastructure-research'])
  })

  it('opens tier 2 of the Research field after Higher Education', () => {
    const e = empire({ researched: ['higher-education'] })
    const r = new Set(e.researched)
    expect(unlockedTier('Research', r)).toBe(2)
    expect(advanceStatus(ADVANCE_BY_ID.get('r-and-d-program')!, r)).toBe('available')
    expect(advanceStatus(ADVANCE_BY_ID.get('small-research-lab')!, r)).toBe('locked')
  })

  it('handles any-of prerequisites with a count', () => {
    const govs = ['governmental-systems', 'monarchy']
    expect(advanceStatus(ADVANCE_BY_ID.get('civil-service')!, new Set(govs))).toBe('available')
    expect(advanceStatus(ADVANCE_BY_ID.get('revolution')!, new Set(govs))).toBe('locked')
    expect(advanceStatus(ADVANCE_BY_ID.get('revolution')!, new Set([...govs, 'democracy']))).toBe('available')
  })
})

describe('builds', () => {
  it('filters by research and planet type', () => {
    const e = empire({ researched: ['infrastructure-research', 'power-generator-solid-fuel', 'agricultural-farming'] })
    const home = availableBuilds(e, e.planets[0]).map((f) => f.id)
    expect(home).toContain('solid-fuel-power-generator')
    expect(home).toContain('farms')
    const barren = availableBuilds(e, { ...e.planets[0], type: 'barren' }).map((f) => f.id)
    expect(barren).not.toContain('farms')
  })
})

describe('endTurn', () => {
  it('pays costs, applies income, completes a one-turn build and records the log', () => {
    const e = empire()
    const next = endTurn(
      e,
      { research: ['higher-education'], builds: [] },
      'tester',
    )
    const he = ADVANCE_BY_ID.get('higher-education')!
    expect(next.turn).toBe(2)
    expect(next.researched).toEqual(['higher-education'])
    expect(next.resources.credits).toBe(200_000 - he.cost.credits + base.credits)
    expect(next.log).toHaveLength(1)
    expect(e.turn).toBe(1) // input untouched

    const withPower = { ...next, researched: [...next.researched, 'infrastructure-research', 'power-generator-solid-fuel'] }
    const after = endTurn(
      withPower,
      { research: [], builds: [{ planetId: e.planets[0].id, facilityId: 'solid-fuel-power-generator' }] },
      'tester',
    )
    expect(after.planets[0].facilities).toEqual([{ facilityId: 'solid-fuel-power-generator', count: 1 }])
    // income from the new generator only arrives from the following turn
    expect(after.resources.credits).toBe(
      withPower.resources.credits - FACILITY_BY_ID.get('solid-fuel-power-generator')!.cost.credits + base.credits,
    )
    expect(projectedIncome(after).credits).toBe(base.credits + 2500)
  })

  it('rejects unaffordable, unavailable and over-slot actions', () => {
    const poor = empire({ resources: { credits: 10, rawMats: 10, energy: 10, manpower: 10 } })
    expect(validateActions(poor, { research: ['higher-education'], builds: [] })).toContain(
      'Not enough resources for the selected actions.',
    )
    const e = empire()
    expect(validateActions(e, { research: ['r-and-d-program'], builds: [] })[0]).toMatch(/not available/)
    expect(researchSlots(e)).toBe(1)
    expect(validateActions(e, { research: ['higher-education', 'infrastructure-research'], builds: [] })[0]).toMatch(
      /Only 1 research slot/,
    )
    expect(() => endTurn(e, { research: ['r-and-d-program'], builds: [] }, 'tester')).toThrow()
  })

  it('counts research slots from labs', () => {
    const e = empire()
    e.planets[0].facilities.push({ facilityId: 'large-research-lab', count: 2 })
    expect(researchSlots(e)).toBe(3)
  })
})
