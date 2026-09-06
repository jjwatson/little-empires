// Hand-curated fixes applied by convert-xlsx.mjs. Keys are advance ids (slugified names).
export const SKIP_SHEETS = ['Production', 'Construction', 'Template', 'Master Sheet']

export const FIELD_NAMES = { 'Weapons Edited': 'Weapons', 'Droids and Computers': 'Droids & Computers' }

// Spelling fixes applied to every name / prerequisite cell before anything else.
export const NAME_FIXES = [
  [/Architechture/g, 'Architecture'],
  [/Reasearch/g, 'Research'],
  [/Mangufacturing/g, 'Manufacturing'],
  [/Hyproponics|Hydpronics/g, 'Hydroponics'],
  [/Ploting/g, 'Plotting'],
  [/Intenstity/g, 'Intensity'],
  [/Satelite/g, 'Satellite'],
  [/\bArtic\b/g, 'Arctic'],
  [/Non-Agression/g, 'Non-Aggression'],
  [/Miitary/g, 'Military'],
  [/Sytems/g, 'Systems'],
  [/System Defense Forces/g, 'System Defence Forces'],
  [/Sealed Habitats\./g, 'Sealed Habitats'],
  [/Droid\s+and Computer/g, 'Droid and Computer'],
  [/Unclocks/g, 'Unlocks'],
]

// "<field>/<name>" -> id, for names that collide across fields
export const ID_OVERRIDES = {
  'Planetary Defense/Sealed Habitats': 'sealed-habitats-military',
}

// alias (as written in a Prerequisites cell, after NAME_FIXES) -> canonical advance id
export const ALIASES = {
  'Starship Design Research': 'space-ship-design-research',
  'Space Station Research': 'space-station-design',
  'Small Space Station Research': 'small-space-station-construction',
  'Droid Production': 'small-droid-factory-research',
  'Droid Production Facilities': 'small-droid-factory-research',
  'Life Support': 'life-support-systems',
  'Automated Mineral Extractors': 'automated-mining',
  'Fuel Extractor Research': 'fuel-extractors-research',
  'Solid Fuel Power Generator': 'power-generator-solid-fuel',
  'Wind Power Generator': 'power-generator-wind',
  'Hydroelectric Power Generators': 'power-generator-hydroelectric',
  'Geothermal Generators': 'power-generator-geothermal',
  'AI Holoprojector Research': 'holographic-projector-systems',
  'Asteroid Mining Ships': 'asteroid-mining-ship',
  Government: 'governmental-systems',
}

const GOVERNMENTS = ['monarchy', 'democracy', 'communist', 'theocracy', 'dictatorship', 'oligarchy']
const OUTPOSTS = ['small-military-outpost-research', 'medium-military-outpost-research', 'large-military-outpost']

// advance id (or "facility:<id>") -> Prereq object, when the text cannot be parsed mechanically
export const PREREQ_OVERRIDES = {
  'computer-assisted-research': { all: ['large-research-lab', 'droid-and-computer-research'] },
  'small-droid-factory-research': { all: ['droid-and-computer-research'] },
  'small-computer-factory-research': { all: ['droid-and-computer-research'] },
  'advanced-mining-techniques': { all: ['mining-and-refining-research'] },
  'advanced-officer-training': { any: ['army-academy', 'naval-academy', 'starfighter-command'] },
  'space-colonisation': { all: ['small-space-station-construction', 'life-support-systems'] },
  'military-alliance': { all: ['non-aggression-pacts'], any: OUTPOSTS },
  'occupational-forces': { all: ['non-aggression-pacts'], any: OUTPOSTS },
  'civil-service': { any: GOVERNMENTS },
  'mining-guild': { any: GOVERNMENTS },
  'agricultural-societies': { any: GOVERNMENTS },
  revolution: { any: GOVERNMENTS, anyCount: 2, note: 'Requires you to have researched the system you are changing to.' },
  reform: { all: ['government-funding'], any: GOVERNMENTS, anyCount: 2 },
  // facilities
  'facility:farms': { all: ['agricultural-farming'] }, // sheet says "Agricultural Research"; Agricultural Farming is what "unlocks Farms"
  'facility:automated-farms': { all: ['automated-farming-research', 'small-droid-factory-research'] },
  'facility:solid-fuel-power-generator': { all: ['power-generator-solid-fuel'] },
  'facility:small-mining-outpost': { all: ['small-mining-outpost'] },
  'facility:medium-mining-outpost': { all: ['medium-mining-outpost'] },
  'facility:large-mining-outpost': { all: ['large-mining-outpost'] },
  'facility:asteroid-mining-barges': { all: ['asteroid-mining-ship'], note: 'Also requires a Starfighter Factory.' },
  'facility:mining-barges-speeder-scale': { note: 'Produced in a Repulsorlift Factory with the necessary blueprints.' },
  'facility:mining-barges-walker-scale': { note: 'Produced in a Walker Factory with the necessary blueprints.' },
  'facility:mining-barges-starfighter-scale': { note: 'Produced in a Starfighter Factory with the necessary blueprints.' },
  'facility:mining-barges-capital-scale': { note: 'Produced in a Capital Ship Dock with the necessary blueprints.' },
}

// advance id -> tier, when the overview block doesn't list it
export const TIER_OVERRIDES = {
  'governmental-systems': 2,
}

// advance id -> tier it unlocks, where the sheet text is wrong or missing
export const UNLOCKS_OVERRIDES = {
  'inter-planetary-trade': 5, // sheet says "Unlocks Tier 4" but it is itself tier 4
}
