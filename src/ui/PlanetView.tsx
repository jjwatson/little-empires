import { Fragment, useMemo, useState } from 'react'
import { FACILITIES, FACILITY_BY_ID, PLANET_TYPES, facilityCostOn, facilityIncomeOn } from '../data'
import type { ResourceSet } from '../data'
import { MarkerLegend, PlanetGlobe } from './PlanetGlobe'
import {
  PROFILE_FIELDS,
  ZERO,
  availableBuilds,
  buildName,
  cancelBuild,
  customBuildProblems,
  customBuildTotal,
  describeFacility,
  facilityWarnings,
  grantCustomFacility,
  grantFacility,
  growthRate,
  isHomeworld,
  newCustomId,
  oncePerPlanet,
  ownedIncome,
  planetHas,
  planetIncome,
  populationCredits,
  reduceFacility,
  removePlanet,
  updateCustomFacility,
  withSpecies,
} from '../model'
import type { CustomBuild, CustomFacility, Empire, OwnedFacility, Planet, Species, TurnActions } from '../model'
import { BuildProgress, EMPTY_EDIT_NOTE, GmForm, Res, ResourceInputs, fmt, pct, toEditNote } from './common'
import type { EditNoteDraft } from './common'

interface Props {
  empire: Empire
  actions: TurnActions
  onActions: (a: TurnActions) => void
  by: string
  onChange: (e: Empire) => void
}

export function PlanetView({ empire, actions, by, onActions, onChange }: Props) {
  const [planetId, setPlanetId] = useState(empire.planets[0].id)
  const planet = empire.planets.find((p) => p.id === planetId) ?? empire.planets[0]
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeNote, setRemoveNote] = useState<EditNoteDraft>(EMPTY_EDIT_NOTE)
  const [query, setQuery] = useState('')
  const [customForm, setCustomForm] = useState(false)
  const rate = growthRate(empire, planet)

  const queued = actions.builds.find((b) => b.planetId === planet.id)
  const options = availableBuilds(empire, planet).filter(
    (f) => !query || f.name.toLowerCase().includes(query.toLowerCase()),
  )

  function setBuild(facilityId: string | null, custom?: CustomBuild) {
    const builds = actions.builds.filter((b) => b.planetId !== planet.id)
    if (facilityId) builds.push(custom ? { planetId: planet.id, facilityId, custom } : { planetId: planet.id, facilityId })
    onActions({ ...actions, builds })
  }

  function updatePlanet(next: Planet) {
    onChange({ ...empire, planets: empire.planets.map((p) => (p.id === planet.id ? next : p)) })
  }

  return (
    <section>
      <div className="card">
        <div className="tabs">
          {empire.planets.map((p) => (
            <button key={p.id} className={p.id === planet.id ? 'active' : ''} onClick={() => setPlanetId(p.id)}>
              <PlanetGlobe type={p.type} seed={p.id} size={18} />
              {p.name}
            </button>
          ))}
        </div>
        <div className="planethead">
          <PlanetGlobe
            type={planet.type}
            seed={planet.id}
            size={112}
            facilities={planet.facilities}
            inProgress={planet.inProgress}
            label={`${planet.name}, ${PLANET_TYPES.find((t) => t.id === planet.type)?.name}`}
          />
          <div>
            <h2>
              {planet.name} <span className="muted">· {PLANET_TYPES.find((t) => t.id === planet.type)?.name}</span>
            </h2>
            <p className="muted">{PLANET_TYPES.find((t) => t.id === planet.type)?.summary}</p>
            <MarkerLegend facilities={planet.facilities} />
          </div>
        </div>
        {removing ? (
          <GmForm
            title={'Remove ' + planet.name + ' and its ' + fmt(planet.population) + ' people'}
            hint="The colony and everyone on it leave the empire. Its old ledger lines keep its name."
            confirm="Confirm removal"
            danger
            placeholder="e.g. Overrun by raiders in session 14"
            note={removeNote}
            onNote={setRemoveNote}
            onCancel={() => setRemoving(false)}
            onSubmit={() => {
              onChange(removePlanet(empire, planet.id, toEditNote(removeNote), by))
              setRemoving(false)
              setRemoveNote(EMPTY_EDIT_NOTE)
              setPlanetId(empire.planets[0].id)
            }}
          />
        ) : editing ? (
          <PlanetEditor
            planet={planet}
            onSave={(next) => {
              updatePlanet(next)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <p>
              Population {fmt(planet.population)} · growing {pct(rate)} a turn
              {planet.growthAdjust ? ` (includes GM adjustment ${pct(planet.growthAdjust)})` : ''} · yields{' '}
              {fmt(populationCredits(planet, rate))} Cr <button onClick={() => setEditing(true)}>edit</button>
              {!isHomeworld(empire, planet.id) && (
                <>
                  {' '}
                  <button className="danger" onClick={() => setRemoving(true)}>
                    Remove colony…
                  </button>
                </>
              )}
            </p>
            <p>
              Other base income <Res r={planet.baseIncome} signedValues /> · Total income{' '}
              <Res r={planetIncome(planet, rate)} signedValues />
            </p>
          </>
        )}
      </div>

      <div className="grid">
        <ProfileCard planet={planet} onSave={updatePlanet} />
        <SpeciesCard planet={planet} onSave={updatePlanet} />
      </div>

      <FacilitiesCard empire={empire} planet={planet} by={by} onChange={onChange} />

      <div className="card">
        <h3 className="spread">
          <span>
            Build this turn{' '}
            {queued && (
              <span className="muted">
                · queued: {queued.custom ? `${queued.custom.name} (Custom Build)` : FACILITY_BY_ID.get(queued.facilityId)?.name}{' '}
                {queued.custom && !customForm && <button onClick={() => setCustomForm(true)}>edit</button>}{' '}
                <button onClick={() => setBuild(null)}>clear</button>
              </span>
            )}
          </span>
          {!planet.inProgress && !customForm && <button onClick={() => setCustomForm(true)}>Custom Build…</button>}
        </h3>
        {planet.inProgress ? (
          <p className="muted">This planet's construction slot is busy until {buildName(planet.inProgress)} finishes.</p>
        ) : customForm ? (
          <CustomBuildForm
            initial={queued?.custom}
            onCancel={() => setCustomForm(false)}
            onSubmit={(custom) => {
              setBuild(queued?.custom ? queued.facilityId : newCustomId(), custom)
              setCustomForm(false)
            }}
          />
        ) : (
          <>
            {queued?.custom && (
              <p className="small">
                <strong>{queued.custom.name}</strong> · {queued.custom.turns} turn{queued.custom.turns === 1 ? '' : 's'} · costs{' '}
                <Res r={queued.custom.costPerTurn} /> a turn while building
                {queued.custom.turns > 1 && (
                  <>
                    {' '}
                    (<Res r={customBuildTotal(queued.custom)} /> in all)
                  </>
                )}{' '}
                · then yields <Res r={queued.custom.income} signedValues /> a turn
                {queued.custom.notes && <span className="muted"> · {queued.custom.notes}</span>}
              </p>
            )}
            <input placeholder="Filter facilities…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {options.length === 0 && <p className="muted">No facilities available. Research unlocks them.</p>}
            <table className="advances">
              <tbody>
                {options.map((f) => {
                  const isQueued = queued?.facilityId === f.id
                  const blocked = oncePerPlanet(f.id) && planetHas(planet, f.id)
                  return (
                    <tr key={f.id} className={isQueued ? 'available' : blocked ? 'locked' : ''}>
                      <td className="act">
                        {blocked ? (
                          <span className="muted small">built</span>
                        ) : (
                          <button className={isQueued ? 'primary' : ''} onClick={() => setBuild(isQueued ? null : f.id)}>
                            {isQueued ? 'Queued' : 'Queue'}
                          </button>
                        )}
                      </td>
                      <td>
                        <strong>{f.name}</strong>
                        <div className="muted small">{f.effects}</div>
                        {f.notes && <div className="muted small">{f.notes}</div>}
                        {f.requires.note && <div className="muted small">Note: {f.requires.note}</div>}
                        {oncePerPlanet(f.id) && <div className="muted small">One per planet; each adds a research slot.</div>}
                        {f.buildTime && f.buildTime > 1 && <div className="small">Build time: {f.buildTime} turns</div>}
                      </td>
                      <td className="cost">
                        <div>
                          Cost: <Res r={facilityCostOn(planet.type, f)} />
                        </div>
                        <div>
                          Monthly: <Res r={facilityIncomeOn(planet.type, f)} signedValues />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  )
}

function PlanetEditor({ planet, onSave, onCancel }: { planet: Planet; onSave: (p: Planet) => void; onCancel: () => void }) {
  const [population, setPopulation] = useState(Math.round(planet.population))
  const [growthPct, setGrowthPct] = useState(planet.growthAdjust * 100)
  const [baseIncome, setBaseIncome] = useState(planet.baseIncome)
  const hasSpecies = planet.species.length > 0
  return (
    <form
      className="inner"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ ...planet, population: hasSpecies ? planet.population : population, growthAdjust: growthPct / 100, baseIncome })
      }}
    >
      <label>
        Population {hasSpecies && <span className="muted small">(set by the species table)</span>}
        <input type="number" value={population} disabled={hasSpecies} onChange={(e) => setPopulation(Number(e.target.value))} />
      </label>
      <label>
        GM growth adjustment, % per turn (base 1% plus research bonuses is automatic)
        <input type="number" step="0.1" value={growthPct} onChange={(e) => setGrowthPct(Number(e.target.value))} />
      </label>
      <h4>Base income per turn besides population credits</h4>
      <ResourceInputs value={baseIncome} onChange={setBaseIncome} />
      <div className="row">
        <button className="primary" type="submit">
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function ProfileCard({ planet, onSave }: { planet: Planet; onSave: (p: Planet) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>(planet.profile)
  const filled = PROFILE_FIELDS.filter((k) => planet.profile[k])
  return (
    <div className="card">
      <h3>
        Profile{' '}
        {!editing && (
          <button
            onClick={() => {
              setDraft(planet.profile)
              setEditing(true)
            }}
          >
            edit
          </button>
        )}
      </h3>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const profile = Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim()))
            onSave({ ...planet, profile })
            setEditing(false)
          }}
        >
          {PROFILE_FIELDS.map((k) => (
            <label key={k} className="tight">
              {k}
              <input value={draft[k] ?? ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
            </label>
          ))}
          <div className="row">
            <button className="primary" type="submit">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : filled.length === 0 ? (
        <p className="muted">No description yet. Star, atmosphere, terrain, starport, exports…</p>
      ) : (
        <table className="kv">
          <tbody>
            {filled.map((k) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{planet.profile[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function SpeciesCard({ planet, onSave }: { planet: Planet; onSave: (p: Planet) => void }) {
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<Species[]>(planet.species)
  const total = rows.reduce((n, s) => n + s.population, 0)

  function start() {
    setRows(planet.species.length ? planet.species.map((s) => ({ ...s, population: Math.round(s.population) })) : [{ name: '', population: Math.round(planet.population) }])
    setEditing(true)
  }

  return (
    <div className="card">
      <h3>Demographics {!editing && <button onClick={start}>edit</button>}</h3>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSave(withSpecies(planet, rows.filter((s) => s.name.trim() && s.population > 0)))
            setEditing(false)
          }}
        >
          <table className="kv">
            <tbody>
              {rows.map((s, i) => (
                <tr key={i}>
                  <td>
                    <input placeholder="Species" value={s.name} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={s.population}
                      onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, population: Number(e.target.value) } : r)))}
                    />
                  </td>
                  <td>
                    <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Total {fmt(total)}. Leaving the table empty keeps a single population figure.</p>
          <div className="row">
            <button type="button" onClick={() => setRows([...rows, { name: '', population: 0 }])}>
              Add species
            </button>
            <button className="primary" type="submit">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : planet.species.length === 0 ? (
        <p className="muted">Single population figure of {fmt(planet.population)}. Add species to track them separately.</p>
      ) : (
        <table className="kv">
          <tbody>
            {planet.species.map((s) => (
              <tr key={s.name}>
                <th>{s.name}</th>
                <td className="num">{fmt(s.population)}</td>
                <td className="num muted">{pct(s.population / planet.population)}</td>
              </tr>
            ))}
            <tr>
              <th>Total</th>
              <td className="num">
                <strong>{fmt(planet.population)}</strong>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}

// --- GM edits ----------------------------------------------------------------------------

type FacilityEdit = { kind: 'remove' | 'edit'; facilityId: string } | { kind: 'cancel' | 'add' | 'custom' }

interface NoteProps {
  note: EditNoteDraft
  onNote: (n: EditNoteDraft) => void
  onCancel: () => void
}

/** Owned facilities, with a GM edit mode for recording what happened in play. */
function FacilitiesCard({ empire, planet, by, onChange }: { empire: Empire; planet: Planet; by: string; onChange: (e: Empire) => void }) {
  const [gm, setGm] = useState(false)
  const [edit, setEdit] = useState<FacilityEdit | null>(null)
  const [note, setNote] = useState<EditNoteDraft>(EMPTY_EDIT_NOTE)
  const building = planet.inProgress ? buildName(planet.inProgress) : ''

  function open(e: FacilityEdit) {
    setEdit(e)
    setNote(EMPTY_EDIT_NOTE)
  }
  function close() {
    setEdit(null)
    setNote(EMPTY_EDIT_NOTE)
  }
  function apply(next: Empire) {
    onChange(next)
    close()
  }

  return (
    <div className="card">
      <h3>
        Facilities{' '}
        <button
          onClick={() => {
            setGm(!gm)
            close()
          }}
        >
          {gm ? 'Done' : 'GM edit'}
        </button>
      </h3>
      {gm && <p className="gmnote">Record what happened in play. Nothing is paid unless you say so, and every change is written to the ledger.</p>}
      {planet.facilities.length === 0 && !planet.inProgress && <p className="muted">Nothing built yet.</p>}
      <table className="advances">
        <tbody>
          {planet.facilities.map((o) => {
            const info = describeFacility(o)
            if (!info) return null
            const mine = edit && 'facilityId' in edit && edit.facilityId === o.facilityId ? edit.kind : null
            return (
              <Fragment key={o.facilityId}>
                <tr>
                  {gm && (
                    <td className="act">
                      <button className="danger" onClick={() => open({ kind: 'remove', facilityId: o.facilityId })}>
                        Remove…
                      </button>
                      {info.custom && <button onClick={() => open({ kind: 'edit', facilityId: o.facilityId })}>Edit…</button>}
                    </td>
                  )}
                  <td>
                    <strong>{info.name}</strong>
                    {o.count > 1 ? ` ×${o.count}` : ''}
                    {info.custom && <span className="muted small"> · custom</span>}
                    {info.notes && <div className="muted small">{info.notes}</div>}
                  </td>
                  <td className="cost">
                    <Res r={ownedIncome(planet.type, o)} signedValues /> each
                  </td>
                </tr>
                {mine === 'remove' && (
                  <tr className="editrow">
                    <td colSpan={3}>
                      <RemoveFacilityForm empire={empire} planet={planet} owned={o} name={info.name} by={by} note={note} onNote={setNote} onDone={apply} onCancel={close} />
                    </td>
                  </tr>
                )}
                {mine === 'edit' && o.custom && (
                  <tr className="editrow">
                    <td colSpan={3}>
                      <CustomFacilityForm
                        title={`Edit ${info.name}`}
                        initial={o.custom}
                        note={note}
                        onNote={setNote}
                        onCancel={close}
                        onSubmit={(custom) => apply(updateCustomFacility(empire, planet.id, o.facilityId, custom, toEditNote(note), by))}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          {planet.inProgress && (
            <tr className="locked">
              {gm && (
                <td className="act">
                  <button className="danger" onClick={() => open({ kind: 'cancel' })}>
                    Cancel build…
                  </button>
                </td>
              )}
              <td colSpan={2}>
                <BuildProgress build={planet.inProgress} />
              </td>
            </tr>
          )}
          {edit?.kind === 'cancel' && planet.inProgress && (
            <tr className="editrow">
              <td colSpan={3}>
                <GmForm
                  title={`Cancel building ${building}`}
                  hint="Nothing is refunded unless you change the stockpile below."
                  confirm="Confirm cancellation"
                  danger
                  note={note}
                  onNote={setNote}
                  onCancel={close}
                  onSubmit={() => apply(cancelBuild(empire, planet.id, toEditNote(note), by))}
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {gm && !edit && (
        <div className="row">
          <button onClick={() => open({ kind: 'add' })}>Add catalogue facility…</button>
          <button onClick={() => open({ kind: 'custom' })}>Add custom facility…</button>
        </div>
      )}
      {edit?.kind === 'add' && <AddFacilityForm empire={empire} planet={planet} by={by} note={note} onNote={setNote} onDone={apply} onCancel={close} />}
      {edit?.kind === 'custom' && (
        <CustomFacilityForm
          title="Add a custom facility"
          withCount
          note={note}
          onNote={setNote}
          onCancel={close}
          onSubmit={(custom, count) => apply(grantCustomFacility(empire, planet.id, custom, count, toEditNote(note), by))}
        />
      )}
    </div>
  )
}

function RemoveFacilityForm({
  empire,
  planet,
  owned,
  name,
  by,
  onDone,
  ...noteProps
}: NoteProps & { empire: Empire; planet: Planet; owned: OwnedFacility; name: string; by: string; onDone: (e: Empire) => void }) {
  const [count, setCount] = useState(owned.count)
  return (
    <GmForm
      title={`Remove ${name} from ${planet.name}`}
      hint="Destroyed, captured, sold or given away. Nothing is refunded unless you change the stockpile below."
      confirm="Confirm removal"
      danger
      disabled={count < 1}
      {...noteProps}
      onSubmit={() => onDone(reduceFacility(empire, planet.id, owned.facilityId, count >= owned.count ? undefined : count, toEditNote(noteProps.note), by))}
    >
      {owned.count > 1 && (
        <label>
          How many of the {owned.count}
          <input type="number" min={1} max={owned.count} value={count} onChange={(e) => setCount(Math.max(1, Math.min(owned.count, Number(e.target.value))))} />
        </label>
      )}
    </GmForm>
  )
}

const CATALOGUE = [...FACILITIES].sort((a, b) => a.name.localeCompare(b.name))

function AddFacilityForm({ empire, planet, by, onDone, ...noteProps }: NoteProps & { empire: Empire; planet: Planet; by: string; onDone: (e: Empire) => void }) {
  const [query, setQuery] = useState('')
  const [facilityId, setFacilityId] = useState(CATALOGUE[0].id)
  const [count, setCount] = useState(1)
  const options = useMemo(() => CATALOGUE.filter((f) => !query || f.name.toLowerCase().includes(query.toLowerCase())), [query])
  const selected = options.some((f) => f.id === facilityId) ? facilityId : options[0]?.id
  const chosen = selected ? FACILITY_BY_ID.get(selected) : undefined
  const warnings = selected ? facilityWarnings(planet, selected) : []
  return (
    <GmForm
      title={`Add a facility to ${planet.name}`}
      hint="Anything from the construction list, researched or not. Free unless you change the stockpile below."
      confirm="Add facility"
      disabled={!chosen || count < 1}
      {...noteProps}
      onSubmit={() => chosen && onDone(grantFacility(empire, planet.id, chosen.id, count, toEditNote(noteProps.note), by))}
    >
      <div className="row wrap">
        <input placeholder="Filter facilities…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={selected ?? ''} onChange={(e) => setFacilityId(e.target.value)}>
          {options.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      {chosen && (
        <p className="muted small">
          {chosen.effects} · Monthly on this world: <Res r={facilityIncomeOn(planet.type, chosen)} signedValues />
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} className="error">
          {w}
        </p>
      ))}
      <label>
        How many
        <input type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} />
      </label>
    </GmForm>
  )
}

function CustomFacilityForm({
  title,
  initial,
  withCount = false,
  onSubmit,
  ...noteProps
}: NoteProps & { title: string; initial?: CustomFacility; withCount?: boolean; onSubmit: (custom: CustomFacility, count: number) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [income, setIncome] = useState<ResourceSet>(initial?.income ?? ZERO)
  const [count, setCount] = useState(1)
  return (
    <GmForm
      title={title}
      hint="Something not in the construction list. Its monthly yield joins the planet's income; use negatives for upkeep."
      confirm={initial ? 'Save' : 'Add facility'}
      disabled={!name.trim() || count < 1}
      {...noteProps}
      onSubmit={() => onSubmit({ name: name.trim(), income, notes: notes.trim() || undefined }, count)}
    >
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Captured pirate base" required />
      </label>
      <label>
        Description (optional)
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <h4>Monthly yield per facility</h4>
      <ResourceInputs value={income} onChange={setIncome} />
      {withCount && (
        <label>
          How many
          <input type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} />
        </label>
      )}
    </GmForm>
  )
}

// --- Custom Build ------------------------------------------------------------------------

/** A multi-round project agreed in play: what it costs each turn, how long it takes, what it yields when done. */
function CustomBuildForm({ initial, onSubmit, onCancel }: { initial?: CustomBuild; onSubmit: (c: CustomBuild) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [turns, setTurns] = useState(initial?.turns ?? 1)
  const [costPerTurn, setCostPerTurn] = useState<ResourceSet>(initial?.costPerTurn ?? ZERO)
  const [income, setIncome] = useState<ResourceSet>(initial?.income ?? ZERO)
  const draft: CustomBuild = { name: name.trim(), turns, costPerTurn, income }
  if (notes.trim()) draft.notes = notes.trim()
  const problems = customBuildProblems(draft)
  return (
    <form
      className="inner"
      onSubmit={(e) => {
        e.preventDefault()
        if (!problems.length) onSubmit(draft)
      }}
    >
      <h4>{initial ? 'Edit Custom Build' : 'Custom Build'}</h4>
      <p className="gmnote">
        Something agreed in play rather than taken from the catalogue. It takes this planet's construction slot for the whole run, the cost is
        paid at the end of every turn it is in progress, and when it finishes it joins the facilities and yields the amount below each turn.
      </p>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Refit the orbital shipyard" required />
      </label>
      <label>
        Description (optional)
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Goes on the ledger lines" />
      </label>
      <label>
        Turns to build
        <input type="number" min={1} step={1} value={turns} onChange={(e) => setTurns(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
      </label>
      <h4>Cost per turn while building</h4>
      <ResourceInputs value={costPerTurn} onChange={setCostPerTurn} />
      {turns > 1 && (
        <p className="muted small">
          <Res r={customBuildTotal(draft)} /> over the {turns} turns.
        </p>
      )}
      <h4>Yield per turn once complete (negative for upkeep)</h4>
      <ResourceInputs value={income} onChange={setIncome} />
      <div className="row">
        <button className="primary" type="submit" disabled={problems.length > 0}>
          {initial ? 'Save' : 'Queue Custom Build'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
