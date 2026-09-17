import { describe, expect, it } from 'vitest'
import { availabilityNote, blueprintWarning, isCommon, itemUrl, loadItemStats, loadItems, searchItems } from './items'
import type { Item } from './items'
import { BLUEPRINT_SCALES } from './types'

const fixture: Item[] = [
  { id: 'e-11', name: 'BlasTech E-11', type: 'Blaster Rifle', scale: 'Character', credits: 1000, availability: 2, restricted: 'F' },
  { id: 'modified-e-11-blaster-rifle', name: 'Modified E-11 Blaster Rifle', model: 'BlasTech E-11/S Blaster Rifle', type: 'Modified blaster/slug-thrower', scale: 'Character', credits: 7000, availability: 4, restricted: 'X' },
  { id: 'e-wing', name: 'E-wing', type: 'Starfighter', scale: 'Starfighter', credits: 185000, availability: 3 },
  { id: 'x-26-starhaul', name: 'X-26 StarHaul', model: 'Incom X-26 StarHaul', type: 'Space barge', scale: 'Starfighter', credits: 325000 },
  { id: 'r2-astromech', name: 'R2 Astromech Droid', type: 'Astromech droid', scale: 'Droid', credits: 4525, availability: 2 },
]

describe('searchItems', () => {
  it('ranks title prefix above title contains above model/type matches', () => {
    expect(searchItems('e-11', 8, fixture).map((i) => i.id)).toEqual(['e-11', 'modified-e-11-blaster-rifle'])
    const names = searchItems('blastech', 8, fixture).map((i) => i.name)
    expect(names[0]).toBe('BlasTech E-11')
    expect(names).toContain('Modified E-11 Blaster Rifle')
  })

  it('requires every word and searches model and type', () => {
    expect(searchItems('space barge', 8, fixture).map((i) => i.id)).toEqual(['x-26-starhaul'])
    expect(searchItems('incom', 8, fixture).map((i) => i.id)).toEqual(['x-26-starhaul'])
    expect(searchItems('incom rifle', 8, fixture)).toEqual([])
    expect(searchItems('   ', 8, fixture)).toEqual([])
  })

  it('caps the number of results', () => {
    expect(searchItems('e', 2, fixture)).toHaveLength(2)
  })
})

describe('blueprintWarning', () => {
  it('flags uncommon or restricted items only', () => {
    expect(blueprintWarning(fixture[4])).toBeUndefined()
    expect(blueprintWarning(fixture[3])).toBeUndefined()
    expect(blueprintWarning(fixture[0])).toMatch(/licence needed/)
    expect(blueprintWarning(fixture[1])).toMatch(/availability 4, illegal/)
  })
})

describe('isCommon and availabilityNote', () => {
  it('lets availability 1, 2 and unrated items through, not 3 or more', () => {
    expect(fixture.map(isCommon)).toEqual([true, false, false, true, true])
    expect(availabilityNote(fixture[3])).toMatch(/not listed/)
    expect(availabilityNote(fixture[0])).toBeUndefined()
  })
})

describe('itemUrl', () => {
  it('links to the wiki page with underscores and safe characters', () => {
    expect(itemUrl({ name: 'Modified E-11 Blaster Rifle' })).toBe('http://d6holocron.com/wiki/index.php/Modified_E-11_Blaster_Rifle')
    expect(itemUrl({ name: 'TIE/D Defender' })).toBe('http://d6holocron.com/wiki/index.php/TIE/D_Defender')
    expect(itemUrl({ name: 'R&E Freighter?' })).toBe('http://d6holocron.com/wiki/index.php/R%26E_Freighter%3F')
  })
})

describe('snapshot', () => {
  it('has thousands of items with unique ids, valid scales and stat shards', async () => {
    const { items, byId, fetched, common } = await loadItems()
    expect(fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(common.length).toBeGreaterThan(3000)
    expect(common.length).toBeLessThan(items.length)
    expect(common.every(isCommon)).toBe(true)
    expect(items.length).toBeGreaterThan(1000)
    expect(byId.size).toBe(items.length)
    for (const i of items) expect(i.scale === undefined || BLUEPRINT_SCALES.includes(i.scale)).toBe(true)
    expect(items.filter((i) => i.credits != null).length).toBeGreaterThan(items.length / 3)

    const rifle = items.find((i) => i.name === 'Modified E-11 Blaster Rifle')!
    expect(rifle).toMatchObject({ scale: 'Character', credits: 7000, availability: 4, restricted: 'X' })
    const stats = await loadItemStats(rifle.id)
    expect(stats?.stats.find(([k]) => k === 'Damage')?.[1]).toMatch(/5D/)
    expect(await loadItemStats('no-such-item')).toBeUndefined()
  })
})
