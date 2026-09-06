# Little Empires – Colony Manager

A small static web app for two players to run colonies in a Star Wars RPG campaign, following the
house rules in `docs/`. State lives as JSON files in a shared Google Drive folder; the app itself is
hosted on GitHub Pages. No servers, nothing to pay for.

- App: <https://jjwatson.github.io/little-empires/>
- Shared Drive folder: <https://drive.google.com/drive/folders/1eLx_1K6oloAKsnnGlPQGx4jVtEeZh5vm>

## What it does (v1)

- One **empire** per file: a homeworld plus any colonies you found, all sharing one stockpile of
  Credits, Raw Mats, Energy and Manpower.
- **Research tree** from the spreadsheet: 17 fields × 5 tiers, with prerequisites and tier unlocks.
- **Construction** per planet: build costs, monthly income, planet-type bonuses and restrictions.
- **End turn**: queue research (one per slot) and one build per planet, see the projected stockpile,
  confirm, and the turn is written to the log and saved to Drive.
- **Two players editing**: saves are checked against Drive's modified time. If the other player
  saved after you loaded, you get to choose reload or overwrite.

Not yet covered: production/fabrication, troop training, blueprints, salvage, festivals, trade
routes, super computer actions, government/civics percentage modifiers, population growth.

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

## Layout

```
src/data     JSON rules data, types, planet-type modifiers
src/model    pure game logic: prerequisites, income, end-turn (unit tested)
src/drive    Google sign-in and Drive file access
src/ui       React screens
scripts      xlsx converter and data validator
docs         the house rules this implements
```
