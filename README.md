# Little Empires – Colony Manager

A small static web app for two players to run colonies in a Star Wars RPG campaign, following the
house rules in `docs/`. State lives as JSON files in a shared Google Drive folder; the app itself is
hosted on GitHub Pages. No servers, nothing to pay for.

- App: <https://jjwatson.github.io/little-empires/>
- Shared Drive folder: <https://drive.google.com/drive/folders/1eLx_1K6oloAKsnnGlPQGx4jVtEeZh5vm>

## What it does

The screens follow the tabs of the rule creator's own tracking sheet
(`docs/Mandragor 12 System 3.0.xlsx`):

| Sheet tab | Screen |
|---|---|
| Resources header, Balance totals | **Overview**: stockpile, income, bonuses in effect, government in operation, founding colonies |
| Planets, Demographics | **Planets**: profile, species table with growth, facilities (with GM edits), this turn's build |
| Completed Research | **Research**: the tree, what is unlocked, blueprint queue |
| Resources, Balance Sheet | **Economy**: income statement by facility category; itemised ledger with manual adjustments |
| all the slot columns | **End Turn**: research, prototypes, blueprints, construction, projected stockpile |

- One **empire** per file: a homeworld plus any colonies you found, all sharing one stockpile of
  Credits, Raw Mats, Energy and Manpower.
- **Research tree** from the spreadsheet: 16 fields × 5 tiers, with prerequisites and tier unlocks.
  The Research screen has a Table view (one field at a time) and a Graph view: a force-directed
  radial map of all 207 advances with your empire at the centre, one spoke per field, rings by
  distance from the start. Click an advance to light up its whole chain and queue it from the side panel.
- **Construction** per planet: build costs, monthly income, planet-type bonuses and restrictions.
- **Population** grows 1% a turn plus research bonuses (Monarchy +1%), per species if you list them.
  Base credit income is one credit per ten population after growth, as in the sheet; Raw Mats,
  Energy and Manpower base income stay GM-entered numbers.
- **Ledger**: every turn is itemised (income, each research, each build, blueprints, prototypes,
  colonies, manual adjustments) and always reconciles with the stockpile.
- **Two players editing**: saves are checked against Drive's modified time. If the other player
  saved after you loaded, you get to choose reload or overwrite.
- **GM edits** for what happens in the roleplaying game outside the colony rules. Each screen has a
  "GM edit" control: on Planets you can add any catalogue facility (researched or not), add a custom
  facility with its own name and monthly yield, remove or reduce facilities, cancel a build in progress
  and remove a colony (never the homeworld); on Overview you can add a world without paying the setup
  cost; on Research you can grant or revoke advances (no cascade, a revoked government is cleared) and
  add or delete held blueprints. Every edit asks what happened, is free unless you also change the
  stockpile, and is written to the ledger as a **GM event** so the history stays complete.
- **Blueprint item lookup** from a snapshot of the [D6 Holocron wiki](http://d6holocron.com/wiki/)
  (about 4,200 weapons, gear, droids, vehicles and ships). Typing a blueprint name offers matches;
  picking one fills the name, pre-selects the scale when the page states it (droid stat blocks count as
  Droid), records the list price on the blueprint and in the ledger, and warns when the item is above
  availability 2 or carries an R/X/F code (house rule: the GM decides). A **stats** link shows the
  item's stat block with a link to its wiki page. Free-text items still work.

Rulings from the rule creator (2026-09-07) that the app applies:

- Every research lab (Small, Large, Orbital) adds a research slot; each kind can be built once per planet.
- Completing the research for a building hands you one working prototype, its cost included in the
  research. You pick the planet on the End Turn screen.
- Blueprint costs follow the house-rules table (the sheet's 10-Energy Character row is a typo).
- Governmental systems: only one is in operation at a time; pick it on the Overview.

Not yet covered (the sheet's Production Capacity, Production, Production Items, Stores, Assets and
Personnel tabs): production/fabrication, troop training, stores, personnel, salvage, festivals, trade
routes, super computer actions, and percentage modifiers other than population growth.

Files saved by earlier versions are migrated on load, one schema step at a time: v1's per-turn log
becomes ledger lines and the GM-entered credit base is dropped in favour of the population formula;
v2 files only gain the optional fields GM edits use. A file saved by a newer app than the one loaded
is refused with a prompt to reload, so an out-of-date tab cannot rewrite it. When a release changes
the schema, both players should reload the site before either saves.

## One-time Google setup (do this once, then share the client id)

1. Go to <https://console.cloud.google.com/>, create a project (e.g. "little-empires").
2. **APIs & Services → Library**: enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: User type *External*, fill in the app name and your
   email, leave it in **Testing** status. Under *Test users* add both players' Google accounts.
   (Testing mode is what lets a two-person app use the Drive scope without Google's verification.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type *Web application*.
   Authorised JavaScript origins (origin only, no path, no trailing slash):
   - `http://localhost:5173`
   - `https://jjwatson.github.io`
   No redirect URIs are needed.
5. Copy the client id. Locally: `cp .env.example .env` and paste it in. For GitHub Pages: repo
   **Settings → Secrets and variables → Actions → Variables**, add `VITE_GOOGLE_CLIENT_ID`.
6. The shared Drive folder above is pre-filled in the app. Make sure it is shared with the other
   player as Editor. A different folder can be pasted in on the sign-in screen.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173/little-empires/
npm test           # data validation + model tests
npm run build      # static output in dist/
```

## Deploying

Push to `main` (or `master`). `.github/workflows/deploy.yml` runs the tests, builds and publishes
to GitHub Pages. In the repo settings set **Pages → Source** to *GitHub Actions* the first time.
The workflow passes the repo name as the Vite base path, so renaming the repo needs no code change;
only the fallback in `vite.config.ts` (used by `npm run dev`) would go stale.

## Updating the rules data

The spreadsheet in `docs/` is converted once into `src/data/research.json` and
`src/data/construction.json`, which are the source of truth for the app.

```bash
npm run convert-data     # re-reads docs/Research*.xlsx
npm run validate-data    # checks every prerequisite resolves
```

Spelling fixes, prerequisite parsing overrides and tier corrections live in
`scripts/data-overrides.mjs`. When the converter prints `UNRESOLVED PREREQS`, add an alias or an
override there and re-run.

The Graph view's node positions are curated by hand in `src/data/researchLayout.json` (advance id →
`[x, y]`, hub at the origin) and are fixed in the app. After the advances change, generate a fresh
starting point with `npx vite-node scripts/layout-research.ts --mode centre` (Research ringing the hub;
`--mode spokes` gives one wedge per field), then edit the JSON as needed. To adjust by hand, open the app
with `?tune` on the URL: nodes become draggable and **Copy layout** puts the positions on the clipboard. `npm test` checks every
advance has a position, nothing overlaps, and link crossings and label clashes stay under their ceilings.

### D6 Holocron item snapshot

The wiki is served over plain HTTP, so the app (on HTTPS) cannot read it live. Instead
`scripts/fetch-holocron.mjs` crawls every article once (about 200 requests, a few minutes) and writes
`src/data/items.json` (the compact searchable list, loaded on demand) and `src/data/itemStats/<letter>.json`
(full stat blocks, one shard loaded when a stat card opens). The snapshot date is stored in the data and
shown on the stat card.

```bash
npm run fetch-holocron              # download into .cache/ (git-ignored), then parse
npm run fetch-holocron -- --parse   # re-parse the cached download after editing the overrides
npm run fetch-holocron -- --refresh # download again
```

The parser reads the wiki's free-form `Key: value` stat lines. It prints how many pages became items,
how many have a scale and a price, and the split by scale; unparsed cost or scale spellings can be
handled in `scripts/holocron-overrides.mjs`. `npm run validate-data` checks the snapshot too.

## Layout

```
src/data     JSON rules data, types, planet-type modifiers, facility categories, blueprint costs
src/model    pure game logic: prerequisites, population, modifiers, ledger, end-turn (unit tested)
src/drive    Google sign-in and Drive file access
src/ui       React screens
scripts      xlsx converter, D6 Holocron crawler and data validator
docs         the house rules this implements
```

## Attribution

Item statistics and prices are a snapshot of the [D6 Holocron](http://d6holocron.com/wiki/), a
fan-maintained compendium of West End Games' Star Wars D6 material; every item in the app links back to
its wiki page. Star Wars is a trademark of Lucasfilm Ltd. This tracker is a private hobby tool with no
affiliation to either.
```
