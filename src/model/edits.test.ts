import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, ZERO, migrate, newEmpire, newPlanet, planetNameOf } from './empire'
import type { Empire } from './empire'
import {
  cancelBuild,
  facilityWarnings,
  grantAdvance,
  grantBlueprint,
  grantCustomFacility,
  grantFacility,
  grantPlanet,
  reduceFacility,
  removeBlueprint,
  removePlanet,
  revokeAdvance,
  updateCustomFacility,
} from './edits'
import { describeFacility } from './facilities'
import { addAdjustment, ledgerTotal } from './ledger'
import { EMPTY_ACTIONS, endTurn, planetIncome, projectedIncome, pruneActions, researchSlots } from './turn'
import { growthRate } from './population'
import { advanceStatus } from './prereqs'
import { ADVANCE_BY_ID } from '../data'

const base = { credits: 0, rawMats: 500, energy: 500, manpower: 500 }
const start = { credits: 25_000_000, rawMats: 250_000, energy: 250_000, manpower: 50_000 }
const note = { label: 'Session 12' }

function empire(overrides: Partial<Empire> = {}): Empire {
  const home = newPlanet('Home', 'homeworld', 1_000_000, base)
  return { ...newEmpire('Test', home, start, 'tester'), ...overrides }
}
const home = (e: Empire) => e.planets[0]
const last = (e: Empire) => e.ledger[e.ledger.length - 1]

describe('migration to v3', () => {
  it('keeps a v2 file intact apart from the version stamp', () => {
    const v2 = { ...addAdjustment(addAdjustment(empire(), 'Gift', { ...base, credits: 100 }, 'a'), 'Fine', { ...base, credits: -50 }, 'b'), schemaVersion: 2 }
    v2.planets[0].facilities.push({ facilityId: 'farms', count: 2 })
    const e = migrate(v2)
    expect(e.schemaVersion).toBe(SCHEMA_VERSION)
    expect(e.ledger).toHaveLength(3)
    expect(e.ledger.map((l) => l.label)).toEqual(['Colony start', 'Gift', 'Fine'])
    expect(e.planets[0].facilities).toEqual([{ facilityId: 'farms', count: 2 }])
    expect(ledgerTotal(e.ledger)).toEqual(e.resources)
  })

  it('refuses a file from a newer app', () => {
    expect(() => migrate({ ...empire(), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/newer version/)
  })
})

describe('facilities by GM edit', () => {
  it('adds and removes catalogue facilities, writing one event line each', () => {
    const e0 = empire()
    let e = grantFacility(e0, home(e0).id, 'farms', 2, note, 'gm')
    expect(home(e).facilities).toEqual([{ facilityId: 'farms', count: 2 }])
    expect(last(e)).toMatchObject({ kind: 'event', label: 'Session 12', planetId: home(e).id })
    expect(last(e).notes).toMatch(/Added Farms ×2 on Home/)
    expect(e.resources).toEqual(start)

    e = reduceFacility(e, home(e).id, 'farms', 1, note, 'gm')
    expect(home(e).facilities).toEqual([{ facilityId: 'farms', count: 1 }])
    e = reduceFacility(e, home(e).id, 'farms', undefined, note, 'gm')
    expect(home(e).facilities).toEqual([])
    expect(last(e).notes).toMatch(/Removed Farms from Home/)
    expect(() => reduceFacility(e, 'nope', 'farms', 1, note, 'gm')).toThrow(/Unknown planet/)
  })

  it('drops a research slot when a lab is removed', () => {
    const e0 = empire()
    e0.planets[0].facilities.push({ facilityId: 'small-research-lab', count: 1 }, { facilityId: 'large-research-lab', count: 1 })
    expect(researchSlots(e0)).toBe(3)
    expect(researchSlots(reduceFacility(e0, home(e0).id, 'small-research-lab', undefined, note, 'gm'))).toBe(2)
  })

  it('counts custom facilities in income but not in research slots, and keeps them through a turn', () => {
    const e0 = empire()
    const before = planetIncome(home(e0), growthRate(e0, home(e0)))
    const e = grantCustomFacility(e0, home(e0).id, { name: 'Pirate base', income: { credits: 1000, rawMats: -50, energy: 0, manpower: 0 } }, 2, note, 'gm')
    const after = planetIncome(home(e), growthRate(e, home(e)))
    expect(after.credits - before.credits).toBeCloseTo(2000)
    expect(after.rawMats - before.rawMats).toBe(-100)
    expect(projectedIncome(e).rawMats).toBe(base.rawMats - 100)
    const owned = home(e).facilities[0]
    expect(owned.facilityId).toMatch(/^custom:/)
    expect(describeFacility(owned)).toMatchObject({ name: 'Pirate base', custom: true, category: 'Other Facilities' })
    expect(researchSlots(e)).toBe(1)

    const next = endTurn(e, EMPTY_ACTIONS, 'tester')
    expect(home(next).facilities[0]).toMatchObject({ facilityId: owned.facilityId, count: 2, custom: { name: 'Pirate base' } })

    const renamed = updateCustomFacility(e, home(e).id, owned.facilityId, { name: 'Salvage yard', income: base, notes: 'repaired' }, note, 'gm')
    expect(home(renamed).facilities[0].custom).toEqual({ name: 'Salvage yard', income: base, notes: 'repaired' })
    expect(last(renamed).notes).toMatch(/Changed Salvage yard/)
  })

  it('applies an optional stockpile change and keeps the ledger reconciled', () => {
    const e0 = empire()
    const e = grantFacility(e0, home(e0).id, 'farms', 1, { label: 'Bought from traders', delta: { credits: -5000, rawMats: 0, energy: 0, manpower: 0 }, notes: 'haggled' }, 'gm')
    expect(e.resources.credits).toBe(start.credits - 5000)
    expect(ledgerTotal(e.ledger)).toEqual(e.resources)
    expect(last(e).notes).toBe('Added Farms on Home · haggled')
  })

  it('warns about, but does not block, things the rules would refuse', () => {
    const e = empire()
    expect(facilityWarnings({ ...home(e), type: 'barren' }, 'farms')).toHaveLength(1)
    expect(facilityWarnings(home(e), 'farms')).toEqual([])
    const withLab = grantFacility(e, home(e).id, 'small-research-lab', 1, note, 'gm')
    expect(facilityWarnings(home(withLab), 'small-research-lab')[0]).toMatch(/one per planet/)
    expect(home(grantFacility(withLab, home(withLab).id, 'small-research-lab', 1, note, 'gm')).facilities[0].count).toBe(2)
  })

  it('cancels a build in progress', () => {
    const e0 = empire()
    e0.planets[0].inProgress = { facilityId: 'farms', turnsLeft: 2 }
    const e = cancelBuild(e0, home(e0).id, note, 'gm')
    expect(home(e).inProgress).toBeUndefined()
    expect(last(e).notes).toMatch(/Cancelled building Farms/)
    expect(() => cancelBuild(e, home(e).id, note, 'gm')).toThrow(/not building/)
  })

  it('cancels a Custom Build by its own name, with nothing further owed', () => {
    const e0 = empire()
    const custom = { name: 'Orbital refit', turns: 3, costPerTurn: { credits: 1000, rawMats: 0, energy: 0, manpower: 0 }, income: ZERO }
    e0.planets[0].inProgress = { facilityId: 'custom:x', turnsLeft: 2, custom }
    const e = cancelBuild(e0, home(e0).id, note, 'gm')
    expect(home(e).inProgress).toBeUndefined()
    expect(last(e).notes).toMatch(/Cancelled building Orbital refit/)
    expect(ledgerTotal(e.ledger)).toEqual(e.resources)
  })
})

describe('planets by GM edit', () => {
  it('adds a world without cost, movers or research', () => {
    const e0 = empire()
    const e = grantPlanet(e0, 'Nova', 'volcanic', 20_000, base, note, 'gm')
    expect(e.planets).toHaveLength(2)
    expect(e.planets[1]).toMatchObject({ name: 'Nova', type: 'volcanic', population: 20_000 })
    expect(home(e).population).toBe(1_000_000)
    expect(e.resources).toEqual(start)
    expect(last(e)).toMatchObject({ kind: 'event', planetId: e.planets[1].id })
  })

  it('removes a colony with its people and remembers its name for the ledger', () => {
    const e0 = grantPlanet(empire(), 'Nova', 'volcanic', 20_000, base, note, 'gm')
    const nova = e0.planets[1]
    expect(() => removePlanet(e0, home(e0).id, note, 'gm')).toThrow(/homeworld/)
    const e = removePlanet(e0, nova.id, note, 'gm')
    expect(e.planets.map((p) => p.name)).toEqual(['Home'])
    expect(e.planets.reduce((n, p) => n + p.population, 0)).toBe(1_000_000)
    expect(e.formerPlanets).toEqual([{ id: nova.id, name: 'Nova' }])
    expect(planetNameOf(e, nova.id)).toBe('Nova')
    expect(planetNameOf(e, 'unknown')).toBe('unknown')
    expect(last(e).notes).toMatch(/Removed Nova, population 20,000/)
  })
})

describe('research by GM edit', () => {
  it('grants and revokes advances without cascading', () => {
    let e = grantAdvance(empire(), 'monarchy', note, 'gm')
    expect(e.researched).toEqual(['monarchy'])
    expect(() => grantAdvance(e, 'monarchy', note, 'gm')).toThrow(/already/)
    expect(() => grantAdvance(e, 'not-a-thing', note, 'gm')).toThrow(/Unknown advance/)

    e = empire({ researched: ['higher-education', 'r-and-d-program'] })
    e = revokeAdvance(e, 'higher-education', note, 'gm')
    expect(e.researched).toEqual(['r-and-d-program'])
    const r = new Set(e.researched)
    expect(advanceStatus(ADVANCE_BY_ID.get('r-and-d-program')!, r)).toBe('researched')
    expect(advanceStatus(ADVANCE_BY_ID.get('higher-education')!, r)).toBe('available')
    expect(() => revokeAdvance(e, 'higher-education', note, 'gm')).toThrow(/not researched/)
  })

  it('clears the government in operation when its advance is revoked', () => {
    const e0 = empire({ researched: ['governmental-systems', 'monarchy'], government: 'monarchy' })
    expect(revokeAdvance(e0, 'governmental-systems', note, 'gm').government).toBe('monarchy')
    expect(revokeAdvance(e0, 'monarchy', note, 'gm').government).toBeUndefined()
  })
})

describe('blueprints by GM edit', () => {
  it('adds and deletes held blueprints', () => {
    let e = grantBlueprint(empire({ turn: 4 }), 'E-11 blaster', 'Character', note, 'gm')
    expect(e.blueprints).toHaveLength(1)
    expect(e.blueprints[0]).toMatchObject({ name: 'E-11 blaster', scale: 'Character', turn: 4 })
    expect(last(e).notes).toMatch(/Gained blueprint: E-11 blaster/)
    e = removeBlueprint(e, e.blueprints[0].id, note, 'gm')
    expect(e.blueprints).toEqual([])
    expect(last(e).notes).toMatch(/Lost blueprint/)
    expect(() => removeBlueprint(e, 'x', note, 'gm')).toThrow(/No such blueprint/)
  })
})

describe('pruneActions', () => {
  it('drops queued actions that a GM edit made meaningless', () => {
    const e0 = grantPlanet(empire(), 'Nova', 'volcanic', 20_000, base, note, 'gm')
    const [h, nova] = e0.planets
    const actions = {
      research: ['higher-education', 'infrastructure-research'],
      builds: [
        { planetId: nova.id, facilityId: 'farms' },
        { planetId: h.id, facilityId: 'farms' },
      ],
      blueprints: [],
      prototypes: { farms: nova.id, 'small-research-lab': h.id },
    }
    const e = grantAdvance(removePlanet(e0, nova.id, note, 'gm'), 'higher-education', note, 'gm')
    expect(pruneActions(e, actions)).toEqual({
      research: ['infrastructure-research'],
      builds: [{ planetId: h.id, facilityId: 'farms' }],
      blueprints: [],
      prototypes: { 'small-research-lab': h.id },
    })
    expect(pruneActions(e0, actions)).toEqual(actions)
  })
})

describe('blueprints picked from the D6 Holocron', () => {
  it('carry the item id and list price from the queue to the held blueprint and ledger', () => {
    const e0 = empire({ researched: ['higher-education', 'r-and-d-program', 'reverse-engineering'] })
    e0.planets[0].facilities.push({ facilityId: 'small-research-lab', count: 1 })
    const next = endTurn(e0, { ...EMPTY_ACTIONS, blueprints: [{ name: 'BlasTech E-11', scale: 'Character', itemId: 'blastech-e-11', credits: 1000 }] }, 'tester')
    expect(next.blueprints[0]).toMatchObject({ name: 'BlasTech E-11', scale: 'Character', itemId: 'blastech-e-11', credits: 1000 })
    expect(next.ledger.find((l) => l.kind === 'blueprint')?.notes).toBe('List price 1,000 Cr')

    const free = endTurn(e0, { ...EMPTY_ACTIONS, blueprints: [{ name: 'Family heirloom', scale: 'Character' }] }, 'tester')
    expect(Object.keys(free.blueprints[0]).sort()).toEqual(['id', 'name', 'scale', 'turn'])
    expect(free.ledger.find((l) => l.kind === 'blueprint')?.notes).toBeUndefined()
  })

  it('are recorded by GM edit too', () => {
    const e = grantBlueprint(empire(), 'X-26 StarHaul', 'Starfighter', note, 'gm', { itemId: 'x-26-starhaul', credits: 325_000 })
    expect(e.blueprints[0]).toMatchObject({ itemId: 'x-26-starhaul', credits: 325_000 })
    expect(last(e).notes).toMatch(/Gained blueprint: X-26 StarHaul \(Starfighter\) · list price 325,000 Cr/)
    expect(Object.keys(grantBlueprint(empire(), 'Knife', 'Character', note, 'gm').blueprints[0]).sort()).toEqual(['id', 'name', 'scale', 'turn'])
  })
})
