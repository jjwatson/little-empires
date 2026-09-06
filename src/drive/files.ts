// Thin Google Drive v3 REST wrapper for JSON files in one shared folder.
import { getToken } from './auth'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export interface DriveFile {
  id: string
  name: string
  modifiedTime: string
  lastModifyingUser?: { displayName?: string; emailAddress?: string }
}

export class ConflictError extends Error {
  constructor(public remote: DriveFile) {
    super(`File was modified by ${remote.lastModifyingUser?.emailAddress ?? 'someone else'} at ${remote.modifiedTime}`)
  }
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Drive ${res.status}: ${text.slice(0, 300)}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

const FIELDS = 'id,name,modifiedTime,lastModifyingUser(displayName,emailAddress)'

/** Accepts a Drive folder URL or a bare folder id. */
export function parseFolderId(input: string): string | null {
  const s = input.trim()
  const m = /folders\/([A-Za-z0-9_-]+)/.exec(s)
  if (m) return m[1]
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null
}

export async function getFolder(folderId: string): Promise<{ id: string; name: string }> {
  return call(`${API}/files/${folderId}?fields=id,name,mimeType&supportsAllDrives=true`)
}

export async function listJsonFiles(folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType = 'application/json'`)
  const r = await call<{ files: DriveFile[] }>(
    `${API}/files?q=${q}&fields=files(${FIELDS})&orderBy=name&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  )
  return r.files
}

export async function getMeta(fileId: string): Promise<DriveFile> {
  return call(`${API}/files/${fileId}?fields=${FIELDS}&supportsAllDrives=true`)
}

export async function download<T>(fileId: string): Promise<{ data: T; meta: DriveFile }> {
  const [meta, data] = await Promise.all([
    getMeta(fileId),
    call<T>(`${API}/files/${fileId}?alt=media&supportsAllDrives=true`),
  ])
  return { data, meta }
}

export async function createJson(folderId: string, name: string, data: unknown): Promise<DriveFile> {
  const boundary = 'le_' + Math.random().toString(36).slice(2)
  const meta = { name, parents: [folderId], mimeType: 'application/json' }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data, null, 2)}\r\n--${boundary}--`
  return call(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}&supportsAllDrives=true`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
}

/**
 * Overwrite a file's content. If `expectedModifiedTime` is given and the file on Drive
 * has changed since, throws ConflictError instead of clobbering the other player's save.
 */
export async function updateJson(fileId: string, data: unknown, expectedModifiedTime?: string): Promise<DriveFile> {
  if (expectedModifiedTime) {
    const remote = await getMeta(fileId)
    if (remote.modifiedTime !== expectedModifiedTime) throw new ConflictError(remote)
  }
  return call(`${UPLOAD}/files/${fileId}?uploadType=media&fields=${FIELDS}&supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2),
  })
}
