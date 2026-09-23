import { describe, expect, it } from 'vitest'
import { ZERO, migrate, newEmpire, newPlanet } from './empire'
import type { Empire } from './empire'
import {
  EMPTY_ACTIONS,
  blueprintSlots,
  colonyProblems,
  planetTypeLock,
  endTurn,
  foundColony,
  projectedIncome,
  prototypesFor,
  researchSlots,
  validateActions,
} from './turn'
import { addAdjustment, balanceAfterTurn, ledgerTotal } from './ledger'
import { grow, growthRate } from './population'
import { activeBonuses, populationGrowthBonus } from './modifiers'
import { advanceStatus, availableBuilds, availableResearch, unlockedTier } from './prereqs'
import { ADVANCE_BY_ID, FACILITY_BY_ID } from '../data'

const base = { credits: 0, rawMats: 500, energy: 500, manpower: 500 }
const start = { credits: 25_000_000, rawMats: 250_000, energy: 250_000, manpower: 50_000 }

function empire(overrides: Partial<Empire> = {}): Empire {
  const home = newPlanet('Home', 'homeworld', 1_000_000, base)
  const e = newEmpire('Test', home, start, 'tester')
  return { ...e, ...overrides }
}
const act = (a: Partial<typeof EMPTY_ACTIONS>) => ({ ...EMPTY_ACTIONS, ...a })

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

  it('allows each research lab once per planet', () => {
    const e = empire({ researched: ['higher-education', 'r-and-d-program', 'small-research-lab'] })
    const pid = e.planets[0].id
    expect(validateActions(e, act({ builds: [{ planetId: pid, facilityId: 'small-research-lab' }] }))).toEqual([])
    e.planets[0].facilities.push({ facilityId: 'small-research-lab', count: 1 })
    expect(validateActions(e, act({ builds: [{ planetId: pid, facilityId: 'small-research-lab' }] }))[0]).toMatch(/only one per planet/)
  })
})

describe('population and income', () => {
  it('grows 1% a turn, 2% under a Monarchy, and yields a credit per ten heads', () => {
    const e = empire()
    expect(growthRate(e, e.planets[0])).toBeCloseTo(0.01)
    expect(grow(e.planets[0], 0.01).population).toBeCloseTo(1_010_000)
    expect(projectedIncome(e).credits).toBeCloseTo(101_000)

    const mon = empire({ researched: ['governmental-systems', 'monarchy'], government: 'monarchy' })
    expect(populationGrowthBonus(mon)).toBeCloseTo(0.01)
    expect(growthRate(mon, mon.planets[0])).toBeCloseTo(0.02)
    // a researched but inactive government gives nothing
    expect(populationGrowthBonus({ ...mon, government: undefined })).toBe(0)
    expect(activeBonuses(mon).map((b) => b.source)).toContain('Monarchy')
  })

  it('grows each species and keeps the total in step', () => {
    const p = { ...empire().planets[0], species: [{ name: 'A', population: 600 }, { name: 'B', population: 400 }], population: 1000 }
    const g = grow(p, 0.5)
    expect(g.species.map((s) => s.population)).toEqual([900, 600])
    expect(g.population).toBe(1500)
  })
})

describe('endTurn', () => {
  it('pays costs, grows, applies income, completes a one-turn build and itemises the ledger', () => {
    const e = empire()
    const next = endTurn(e, act({ research: ['higher-education'] }), 'tester')
    const he = ADVANCE_BY_ID.get('higher-education')!
    expect(next.turn).toBe(2)
    expect(next.researched).toEqual(['higher-education'])
    expect(next.planets[0].population).toBeCloseTo(1_010_000)
    expect(next.resources.credits).toBeCloseTo(start.credits - he.cost.credits + 101_000)
    expect(next.ledger.map((l) => l.kind)).toEqual(['start', 'income', 'research'])
    expect(ledgerTotal(next.ledger)).toEqual(next.resources)
    expect(e.turn).toBe(1) // input untouched

    const withPower = { ...next, researched: [...next.researched, 'infrastructure-research', 'power-generator-solid-fuel'] }
    const after = endTurn(withPower, act({ builds: [{ planetId: e.planets[0].id, facilityId: 'solid-fuel-power-generator' }] }), 'tester')
    expect(after.planets[0].facilities).toEqual([{ facilityId: 'solid-fuel-power-generator', count: 1 }])
    const gen = FACILITY_BY_ID.get('solid-fuel-power-generator')!
    // income from the new generator only arrives from the following turn
    expect(after.resources.rawMats).toBe(withPower.resources.rawMats - gen.cost.rawMats + base.rawMats)
    expect(projectedIncome(after).rawMats).toBe(base.rawMats + gen.income.rawMats)
    expect(after.ledger.at(-1)).toMatchObject({ kind: 'construction', label: gen.name, planetId: e.planets[0].id })
    expect(ledgerTotal(after.ledger)).toEqual(after.resources)
  })

  it('hands over a free prototype when research completes a building', () => {
    const e = empire({ researched: ['higher-education', 'infrastructure-research', 'basic-construction'] })
    expect(prototypesFor(e, ['power-generator-solid-fuel']).map((f) => f.id)).toEqual(['solid-fuel-power-generator'])
    const next = endTurn(e, act({ research: ['power-generator-solid-fuel'] }), 'tester')
    expect(next.planets[0].facilities).toEqual([{ facilityId: 'solid-fuel-power-generator', count: 1 }])
    expect(next.ledger.at(-1)).toMatchObject({ kind: 'prototype', delta: ZERO })
    // the prototype lab immediately adds a research slot
    const lab = endTurn(
      { ...next, researched: [...next.researched, 'r-and-d-program'] },
      act({ research: ['small-research-lab'] }),
      'tester',
    )
    expect(researchSlots(lab)).toBe(2)
    expect(blueprintSlots(lab)).toBe(0)
    expect(blueprintSlots({ ...lab, researched: [...lab.researched, 'reverse-engineering'] })).toBe(1)
  })

  it('ties a prototype to the research named for it, not to the gateway research before it', () => {
    // The sheet listed the gateway (Colonisation Research / Space Station Design) as the prerequisite for
    // these; the advances that actually allow their construction are Hanger Defense and Satellite.
    const e = empire()
    expect(prototypesFor(e, ['colonisation-research']).map((f) => f.id)).not.toContain('ground-based-hangers')
    const colonised = { ...e, researched: ['colonisation-research'] }
    expect(availableBuilds(colonised, colonised.planets[0]).map((f) => f.id)).not.toContain('ground-based-hangers')
    expect(prototypesFor(colonised, ['hanger-defense']).map((f) => f.id)).toEqual(['ground-based-hangers'])

    expect(prototypesFor(e, ['space-station-design']).map((f) => f.id)).not.toContain('satellite')
    const stations = { ...e, researched: ['space-station-design'] }
    expect(prototypesFor(stations, ['satellite']).map((f) => f.id)).toEqual(['satellite'])
  })

  it('only grants a prototype when this turn completes the last prerequisite', () => {
    const e = empire()
    // automated-mining-facilities needs two advances; researching one of them alone gives nothing
    expect(prototypesFor(e, ['automated-mining']).map((f) => f.id)).not.toContain('automated-mining-facilities')
    const partial = { ...e, researched: ['small-droid-factory-research'] }
    expect(prototypesFor(partial, ['automated-mining']).map((f) => f.id)).toContain('automated-mining-facilities')
  })

  it('takes blueprints against reverse engineering slots', () => {
    const e = empire({ researched: ['reverse-engineering'] })
    expect(validateActions(e, act({ blueprints: [{ name: 'E-11', scale: 'Character' }] }))[0]).toMatch(/Blueprints need/)
    e.planets[0].facilities.push({ facilityId: 'small-research-lab', count: 1 })
    const next = endTurn(e, act({ blueprints: [{ name: 'E-11', scale: 'Character' }] }), 'tester')
    expect(next.blueprints).toHaveLength(1)
    expect(next.ledger.find((l) => l.kind === 'blueprint')?.delta.credits).toBe(-500)
  })

  it('puts a chosen government into operation automatically', () => {
    const e = empire({ researched: ['higher-education', 'governmental-systems'] })
    expect(endTurn(e, act({ research: ['monarchy'] }), 'tester').government).toBe('monarchy')
  })

  it('rejects unaffordable, unavailable and over-slot actions', () => {
    const poor = empire({ resources: { credits: 10, rawMats: 10, energy: 10, manpower: 10 } })
    expect(validateActions(poor, act({ research: ['higher-education'] }))).toContain('Not enough resources for the selected actions.')
    const e = empire()
    expect(validateActions(e, act({ research: ['r-and-d-program'] }))[0]).toMatch(/not available/)
    expect(researchSlots(e)).toBe(1)
    expect(validateActions(e, act({ research: ['higher-education', 'infrastructure-research'] }))[0]).toMatch(/Only 1 research slot/)
    expect(() => endTurn(e, act({ research: ['r-and-d-program'] }), 'tester')).toThrow()
  })

  it('counts research slots from every kind of lab', () => {
    const e = empire()
    e.planets[0].facilities.push({ facilityId: 'small-research-lab', count: 1 }, { facilityId: 'large-research-lab', count: 1 })
    expect(researchSlots(e)).toBe(3)
  })
})

describe('colony types', () => {

  it('locks each other type behind its Colonisation advance', () => {
    const e = empire()
    expect(colonyProblems(e, 'barren')[0]).toMatch(/needs Barren World Colonisation/)
    expect(planetTypeLock('volcanic', new Set())?.id).toBe('volcanic-exploitation')
    expect(() => foundColony(e, 'Ash', 'volcanic', base, 'tester')).toThrow(/Volcanic Exploitation/)
    const unlocked = empire({ researched: ['barren-world-colonisation'] })
    expect(planetTypeLock('barren', new Set(unlocked.researched))).toBeUndefined()
    expect(foundColony(unlocked, 'Dust', 'barren', base, 'tester').planets[1].type).toBe('barren')
  })
})

describe('ledger', () => {
  it('records adjustments and colonies so the ledger always reconciles', () => {
    let e = addAdjustment(empire({ researched: ['improved-arid-colonies'] }), 'Repairs', { credits: 0, rawMats: -100, energy: -100, manpower: -200 }, 'tester')
    expect(e.resources.rawMats).toBe(start.rawMats - 100)
    e = foundColony(e, 'Sphinx', 'arid', base, 'tester')
    expect(e.planets).toHaveLength(2)
    expect(e.planets[0].population).toBe(950_000)
    expect(e.planets[1].population).toBe(50_000)
    expect(ledgerTotal(e.ledger)).toEqual(e.resources)
    expect(balanceAfterTurn(e.ledger, 0)).toEqual(start)
  })

  it('migrates a v1 file into an itemised ledger that reconciles', () => {
    const v1 = {
      schemaVersion: 1,
      id: 'x',
      name: 'Old',
      turn: 3,
      resources: { credits: 1000, rawMats: 100, energy: 100, manpower: 100 },
      researched: ['higher-education'],
      planets: [{ id: 'p', name: 'Home', type: 'homeworld', population: 1_000_000, baseIncome: { ...base, credits: 50_000 }, facilities: [] }],
      log: [
        { turn: 1, at: 't', by: 'a', researched: ['higher-education'], builds: [], spent: ZERO, income: { credits: 5, rawMats: 5, energy: 5, manpower: 5 } },
      ],
      updatedAt: 't',
      updatedBy: 'a',
    }
    const e = migrate(v1)
    expect(e.schemaVersion).toBe(3)
    expect(e.planets[0].baseIncome.credits).toBe(0)
    expect(e.planets[0].species).toEqual([])
    expect(e.ledger.map((l) => l.kind)).toEqual(['start', 'income', 'research'])
    expect(ledgerTotal(e.ledger)).toEqual(e.resources)
  })
})
