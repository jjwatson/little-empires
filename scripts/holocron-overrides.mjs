// Hand-curated fixes for the D6 Holocron crawl (scripts/fetch-holocron.mjs).

/** Pages that look like items but are not (index pages, house rules, meta). */
export const EXCLUDE_TITLES = new Set(['D6 Holocron Wiki'])

/** Stat keys as typed on the wiki (lower-case) -> the key we store. */
export const KEY_ALIASES = {
  lenght: 'Length',
  'cargo capacity': 'Cargo Capacity',
  'crew skill': 'Crew Skill',
  'nav computer': 'Nav Computer',
  'fire control': 'Fire Control',
  'fire arc': 'Fire Arc',
  'game notes': 'Game Notes',
  'game effects': 'Game Effects',
  manuverability: 'Maneuverability',
  manoeuvrability: 'Maneuverability',
}

/** Title -> blueprint scale, when the page has no usable Scale line. */
export const SCALE_OVERRIDES = {}
