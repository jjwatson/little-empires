// Google Identity Services token client (implicit flow). Static-site friendly: no backend.
// The GIS script is loaded from index.html.

export const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
// drive.file cannot see files the other player created, so the app uses the full Drive scope
// with the OAuth consent screen kept in "Testing" and both players listed as test users.
const SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email'

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (resp: TokenResponse) => void
            error_callback?: (err: { type: string; message?: string }) => void
          }): TokenClient
          revoke(token: string, done?: () => void): void
        }
      }
    }
  }
}

let token: string | null = null
let expiresAt = 0
let client: TokenClient | null = null
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null

function gisReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (window.google?.accounts?.oauth2) return resolve()
      if (Date.now() - started > 10_000) return reject(new Error('Google sign-in script did not load.'))
      setTimeout(tick, 50)
    }
    tick()
  })
}

async function getClient(): Promise<TokenClient> {
  if (client) return client
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID is not set. See README for setup.')
  await gisReady()
  client = window.google!.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      const p = pending
      pending = null
      if (!p) return
      if (resp.error || !resp.access_token) {
        return p.reject(new Error(resp.error_description ?? resp.error ?? 'Sign-in failed'))
      }
      token = resp.access_token
      expiresAt = Date.now() + ((resp.expires_in ?? 3600) - 60) * 1000
      p.resolve(token)
    },
    error_callback: (err) => {
      const p = pending
      pending = null
      p?.reject(new Error(err.message ?? err.type))
    },
  })
  return client
}

/** Interactive sign-in (opens the Google popup). */
export async function signIn(): Promise<string> {
  const c = await getClient()
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    c.requestAccessToken({ prompt: token ? '' : 'consent' })
  })
}

/** Returns a valid token, refreshing silently when the previous one has expired. */
export async function getToken(): Promise<string> {
  if (token && Date.now() < expiresAt) return token
  const c = await getClient()
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    c.requestAccessToken({ prompt: '' })
  })
}

export function isSignedIn(): boolean {
  return Boolean(token && Date.now() < expiresAt)
}

export function signOut(): void {
  if (token) window.google?.accounts.oauth2.revoke(token)
  token = null
  expiresAt = 0
}

export async function whoAmI(): Promise<string> {
  const t = await getToken()
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${t}` },
  })
  if (!res.ok) return 'unknown'
  const j = (await res.json()) as { email?: string }
  return j.email ?? 'unknown'
}
