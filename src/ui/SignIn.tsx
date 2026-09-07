import { useState } from 'react'
import type { DriveFile } from '../drive/files'
import { CLIENT_ID } from '../drive/auth'
import { newEmpire, newPlanet } from '../model'
import type { Empire } from '../model'
import type { ResourceSet } from '../data'
import { ResourceInputs, fmt } from './common'

interface Props {
  user: string | null
  folderId: string
  folderName: string
  files: DriveFile[]
  onSignIn: () => void
  onFolder: (input: string) => void
  onOpen: (f: DriveFile) => void
  onCreate: (e: Empire) => void
  onRefresh: () => void
}

export function SignIn({ user, folderId, folderName, files, onSignIn, onFolder, onOpen, onCreate, onRefresh }: Props) {
  const [folderInput, setFolderInput] = useState(folderId)
  const [creating, setCreating] = useState(false)

  if (!user) {
    return (
      <section className="card center">
        <h2>Sign in</h2>
        <p>Colony state is stored as JSON files in a Google Drive folder shared between the players.</p>
        {CLIENT_ID ? (
          <button className="primary" onClick={onSignIn}>
            Sign in with Google
          </button>
        ) : (
          <p className="error">
            No Google client id configured. Copy <code>.env.example</code> to <code>.env</code> and follow the README.
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="card">
      <h2>Shared folder</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          onFolder(folderInput)
        }}
      >
        <input
          style={{ flex: 1 }}
          placeholder="Paste the Google Drive folder link or id"
          value={folderInput}
          onChange={(e) => setFolderInput(e.target.value)}
        />
        <button type="submit">Open</button>
      </form>

      {folderId && (
        <>
          <h3>
            Empires in “{folderName || folderId}” <button onClick={onRefresh}>refresh</button>
          </h3>
          {files.length === 0 && <p className="muted">No empire files yet.</p>}
          <ul className="filelist">
            {files.map((f) => (
              <li key={f.id}>
                <button className="link" onClick={() => onOpen(f)}>
                  {f.name.replace(/\.json$/, '')}
                </button>
                <span className="muted">
                  {' '}
                  last saved {new Date(f.modifiedTime).toLocaleString()}
                  {f.lastModifyingUser?.emailAddress ? ` by ${f.lastModifyingUser.emailAddress}` : ''}
                </span>
              </li>
            ))}
          </ul>
          {creating ? (
            <NewEmpireForm by={user} onCancel={() => setCreating(false)} onCreate={onCreate} />
          ) : (
            <button className="primary" onClick={() => setCreating(true)}>
              New empire
            </button>
          )}
        </>
      )}
    </section>
  )
}

function NewEmpireForm({ by, onCancel, onCreate }: { by: string; onCancel: () => void; onCreate: (e: Empire) => void }) {
  const [name, setName] = useState('')
  const [homeworld, setHomeworld] = useState('')
  const [population, setPopulation] = useState(1_000_000)
  // The tracking sheet's "Colony Start" line.
  const [resources, setResources] = useState<ResourceSet>({ credits: 25_000_000, rawMats: 250_000, energy: 250_000, manpower: 50_000 })
  const [baseIncome, setBaseIncome] = useState<ResourceSet>({ credits: 0, rawMats: 2_000, energy: 5_000, manpower: 550 })

  return (
    <form
      className="card inner"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || !homeworld.trim()) return
        onCreate(newEmpire(name.trim(), newPlanet(homeworld.trim(), 'homeworld', population, baseIncome), resources, by))
      }}
    >
      <h3>New empire</h3>
      <label>
        Empire name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Homeworld name
        <input value={homeworld} onChange={(e) => setHomeworld(e.target.value)} required />
      </label>
      <label>
        Homeworld population
        <input type="number" value={population} onChange={(e) => setPopulation(Number(e.target.value))} />
      </label>
      <p className="muted small">
        Credits come from population: one per ten people after the turn's 1% growth, so this many people yield about{' '}
        {fmt(population * 1.01 * 0.1)} Cr a turn before research bonuses.
      </p>
      <h4>Starting stockpile</h4>
      <ResourceInputs value={resources} onChange={setResources} />
      <h4>Homeworld base income per turn besides population credits (agree with your GM)</h4>
      <ResourceInputs value={baseIncome} onChange={setBaseIncome} />
      <div className="row">
        <button className="primary" type="submit">
          Create
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
