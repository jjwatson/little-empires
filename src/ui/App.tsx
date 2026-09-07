import { useCallback, useEffect, useState } from 'react'
import { signIn, signOut, whoAmI } from '../drive/auth'
import { ConflictError, download, listJsonFiles, parseFolderId, updateJson, createJson, getFolder } from '../drive/files'
import type { DriveFile } from '../drive/files'
import { EMPTY_ACTIONS, migrate } from '../model'
import type { Empire, TurnActions } from '../model'
import { SignIn } from './SignIn'
import { Overview } from './Dashboard'
import { ResearchTree } from './ResearchTree'
import { PlanetView } from './PlanetView'
import { Economy } from './Economy'
import { EndTurn } from './EndTurn'

type Tab = 'overview' | 'planets' | 'research' | 'economy' | 'endturn'

interface Loaded {
  empire: Empire
  fileId: string
  modifiedTime: string
}

const FOLDER_KEY = 'little-empires.folderId'
/** The players' shared Drive folder; pre-filled so nobody has to paste it. Can still be changed in the UI. */
const DEFAULT_FOLDER_ID = '1eLx_1K6oloAKsnnGlPQGx4jVtEeZh5vm'

const queuedCount = (a: TurnActions) => a.research.length + a.builds.length + a.blueprints.length

export function App() {
  const [user, setUser] = useState<string | null>(null)
  const [folderId, setFolderId] = useState<string>(() => localStorage.getItem(FOLDER_KEY) ?? DEFAULT_FOLDER_ID)
  const [folderName, setFolderName] = useState<string>('')
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [actions, setActions] = useState<TurnActions>(EMPTY_ACTIONS)
  const [tab, setTab] = useState<Tab>('overview')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ remote: DriveFile; pending: Empire } | null>(null)
  const [dirty, setDirty] = useState(false)

  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return undefined
    } finally {
      setBusy(null)
    }
  }, [])

  const refreshFiles = useCallback(async (id: string) => {
    const folder = await getFolder(id)
    setFolderName(folder.name)
    setFiles(await listJsonFiles(id))
  }, [])

  async function handleSignIn() {
    await run('Signing in…', async () => {
      await signIn()
      setUser(await whoAmI())
      if (folderId) await refreshFiles(folderId)
    })
  }

  function handleSignOut() {
    signOut()
    setUser(null)
    setLoaded(null)
    setFiles([])
  }

  async function handleFolder(input: string) {
    const id = parseFolderId(input)
    if (!id) return setError('That does not look like a Drive folder link or id.')
    await run('Opening folder…', async () => {
      await refreshFiles(id)
      setFolderId(id)
      localStorage.setItem(FOLDER_KEY, id)
    })
  }

  async function openFile(file: DriveFile) {
    await run('Loading empire…', async () => {
      const { data, meta } = await download<unknown>(file.id)
      setLoaded({ empire: migrate(data), fileId: meta.id, modifiedTime: meta.modifiedTime })
      setActions(EMPTY_ACTIONS)
      setDirty(false)
      setTab('overview')
    })
  }

  async function createEmpire(empire: Empire) {
    await run('Creating empire…', async () => {
      const meta = await createJson(folderId, `${empire.name}.json`, empire)
      setFiles(await listJsonFiles(folderId))
      setLoaded({ empire, fileId: meta.id, modifiedTime: meta.modifiedTime })
      setActions(EMPTY_ACTIONS)
      setTab('overview')
    })
  }

  /** Apply a change locally and push it to Drive; on conflict keep the local copy and ask. */
  const commit = useCallback(
    async (next: Empire, force = false) => {
      if (!loaded) return
      const stamped = { ...next, updatedAt: new Date().toISOString(), updatedBy: user ?? 'unknown' }
      setLoaded({ ...loaded, empire: stamped })
      setDirty(true)
      setBusy('Saving…')
      setError(null)
      try {
        const meta = await updateJson(loaded.fileId, stamped, force ? undefined : loaded.modifiedTime)
        setLoaded({ empire: stamped, fileId: meta.id, modifiedTime: meta.modifiedTime })
        setDirty(false)
        setConflict(null)
      } catch (e) {
        if (e instanceof ConflictError) setConflict({ remote: e.remote, pending: stamped })
        else setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(null)
      }
    },
    [loaded, user],
  )

  async function reloadFromDrive() {
    if (!loaded) return
    setConflict(null)
    await openFile({ id: loaded.fileId, name: '', modifiedTime: '' })
  }

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const empire = loaded?.empire ?? null
  const by = user ?? 'unknown'

  return (
    <div className="app">
      <header>
        <h1>Little Empires</h1>
        {empire && (
          <nav>
            {(
              [
                ['overview', 'Overview'],
                ['planets', 'Planets'],
                ['research', 'Research'],
                ['economy', 'Economy'],
                ['endturn', `End Turn${queuedCount(actions) ? ' •' : ''}`],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {label}
              </button>
            ))}
            <button onClick={() => setLoaded(null)}>Switch empire</button>
          </nav>
        )}
        <div className="userbox">
          {busy && <span className="busy">{busy}</span>}
          {dirty && !busy && <span className="dirty">unsaved</span>}
          {user ? (
            <>
              <span>{user}</span>
              <button onClick={handleSignOut}>Sign out</button>
            </>
          ) : null}
        </div>
      </header>

      {error && (
        <div className="banner error">
          {error} <button onClick={() => setError(null)}>dismiss</button>
        </div>
      )}
      {conflict && (
        <div className="banner warn">
          <strong>Save conflict.</strong> {conflict.remote.lastModifyingUser?.emailAddress ?? 'The other player'} saved
          this empire at {new Date(conflict.remote.modifiedTime).toLocaleString()}, after you loaded it.
          <button onClick={reloadFromDrive}>Discard mine and reload theirs</button>
          <button onClick={() => commit(conflict.pending, true)}>Overwrite with mine</button>
        </div>
      )}

      <main>
        {!user || !empire ? (
          <SignIn
            user={user}
            folderId={folderId}
            folderName={folderName}
            files={files}
            onSignIn={handleSignIn}
            onFolder={handleFolder}
            onOpen={openFile}
            onCreate={createEmpire}
            onRefresh={() => run('Refreshing…', () => refreshFiles(folderId))}
          />
        ) : tab === 'overview' ? (
          <Overview empire={empire} actions={actions} by={by} onChange={commit} />
        ) : tab === 'research' ? (
          <ResearchTree empire={empire} actions={actions} onActions={setActions} />
        ) : tab === 'planets' ? (
          <PlanetView empire={empire} actions={actions} onActions={setActions} onChange={commit} />
        ) : tab === 'economy' ? (
          <Economy empire={empire} by={by} onChange={commit} />
        ) : (
          <EndTurn
            empire={empire}
            actions={actions}
            by={by}
            onActions={setActions}
            onCommit={async (next) => {
              await commit(next)
              setActions(EMPTY_ACTIONS)
              setTab('overview')
            }}
          />
        )}
      </main>
    </div>
  )
}
