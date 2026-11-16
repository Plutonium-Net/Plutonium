import { beginTransfer, endTransfer, failTransfer } from './transfer-log'

const WORKER_URL = 'https://api.plutoniumnet.work'
const SESSION_KEY = 'plu_session'
const REFRESH_MARGIN_MS = 5 * 60 * 1000

export type CloudUser = {
  uid: string
  email: string
  displayName: string
  photoUrl: string
  idToken: string
  refreshToken: string
  expiresAt: number
}

type AuthResponse = {
  localId: string
  idToken: string
  refreshToken: string
  expiresIn: string
  displayName?: string
  email: string
  photoUrl?: string
}

let currentUser: CloudUser | null = null
let refreshTimer: number | null = null
let authListeners: Array<(user: CloudUser | null) => void> = []

function persistSession() {
  try {
    if (currentUser) localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
  }
}

function readStoredSession(raw: string | null): CloudUser | null {
  if (!raw) return null
  try {
    const user = JSON.parse(raw) as Partial<CloudUser>
    if (
      typeof user.uid !== 'string' ||
      typeof user.email !== 'string' ||
      typeof user.displayName !== 'string' ||
      typeof user.photoUrl !== 'string' ||
      typeof user.idToken !== 'string' ||
      typeof user.refreshToken !== 'string' ||
      typeof user.expiresAt !== 'number'
    ) {
      return null
    }
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoUrl: user.photoUrl,
      idToken: user.idToken,
      refreshToken: user.refreshToken,
      expiresAt: user.expiresAt,
    }
  } catch {
    return null
  }
}

function notify() {
  authListeners.forEach((fn) => {
    try {
      fn(currentUser)
    } catch {
    }
  })
}

function setUser(user: CloudUser | null) {
  currentUser = user
  persistSession()
  scheduleRefresh()
  notify()
}

function isCurrentSession(user: CloudUser) {
  return currentUser?.uid === user.uid && currentUser.refreshToken === user.refreshToken
}

export function isSignedIn() {
  return currentUser !== null
}

export function currentSession() {
  return currentUser ? { ...currentUser } : null
}

export function onAuthChange(callback: (user: CloudUser | null) => void) {
  authListeners.push(callback)
  callback(currentUser)
  return () => {
    authListeners = authListeners.filter((fn) => fn !== callback)
  }
}

function authErrorMessage(data: unknown, fallback: string) {
  const err = (data as { error?: { message?: string } | string })?.error
  if (typeof err === 'string') return err
  if (err?.message) return err.message
  return fallback
}

export async function signInWithEmail(email: string, password: string) {
  const res = await fetch(`${WORKER_URL}/auth/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = (await res.json().catch(() => ({}))) as AuthResponse & { error?: unknown }
  if (!res.ok) throw new Error(authErrorMessage(data, 'Sign in failed'))

  setUser({
    uid: data.localId,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + parseInt(data.expiresIn, 10) * 1000,
    displayName: data.displayName || '',
    email: data.email,
    photoUrl: data.photoUrl || '',
  })
  return currentUser
}

export async function signUp(email: string, password: string, displayName = '') {
  const res = await fetch(`${WORKER_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  })
  const data = (await res.json().catch(() => ({}))) as AuthResponse & { error?: unknown }
  if (!res.ok) throw new Error(authErrorMessage(data, 'Sign up failed'))

  setUser({
    uid: data.localId,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + parseInt(data.expiresIn, 10) * 1000,
    displayName: data.displayName || displayName,
    email: data.email,
    photoUrl: '',
  })
  return currentUser
}

export function signOut() {
  if (refreshTimer) window.clearTimeout(refreshTimer)
  refreshTimer = null
  setUser(null)
}

async function refreshIdToken() {
  const user = currentUser
  if (!user?.refreshToken) return
  try {
    const cfgRes = await fetch(`${WORKER_URL}/config`)
    if (!cfgRes.ok) {
      if (isCurrentSession(user)) signOut()
      return
    }
    const cfg = (await cfgRes.json()) as { apiKey?: string }
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${cfg.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: user.refreshToken }),
    })
    if (!res.ok) {
      if (isCurrentSession(user)) signOut()
      return
    }
    const data = (await res.json()) as { id_token: string; expires_in: string }
    if (!isCurrentSession(user)) return
    const activeUser = currentUser
    if (!activeUser) return
    currentUser = {
      ...activeUser,
      idToken: data.id_token,
      expiresAt: Date.now() + parseInt(data.expires_in, 10) * 1000,
    }
    persistSession()
    scheduleRefresh()
  } catch (err) {
    console.warn('[cloud-store] Token refresh failed:', err)
  }
}

function scheduleRefresh() {
  if (refreshTimer) window.clearTimeout(refreshTimer)
  refreshTimer = null
  if (!currentUser) return
  const delay = Math.max(0, currentUser.expiresAt - Date.now() - REFRESH_MARGIN_MS)
  refreshTimer = window.setTimeout(() => {
    void refreshIdToken()
  }, delay)
}

async function authHeader() {
  if (!currentUser) throw new Error('Not signed in')
  if (Date.now() >= currentUser.expiresAt - 30_000) await refreshIdToken()
  if (!currentUser) throw new Error('Not signed in')
  return { Authorization: `Bearer ${currentUser.idToken}` }
}

function docPath(collection: string, uid: string) {
  const path = collection.includes('/') ? collection : `${collection}/_default`
  return `/users/${uid}/${path}`
}

export type FirestoreValue = Record<string, unknown>

function toFirestoreFields(obj: Record<string, unknown>) {
  const fields: Record<string, FirestoreValue> = {}
  for (const [key, value] of Object.entries(obj)) fields[key] = toFirestoreValue(value)
  return fields
}

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (typeof value === 'string') return { stringValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (typeof value === 'object') {
    return { mapValue: { fields: toFirestoreFields(value as Record<string, unknown>) } }
  }
  return { stringValue: String(value) }
}

export function fromFirestoreFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) obj[key] = fromFirestoreValue(value)
  return obj
}

function fromFirestoreValue(value: FirestoreValue): unknown {
  if ('nullValue' in value) return null
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return parseInt(String(value.integerValue), 10)
  if ('doubleValue' in value) return value.doubleValue
  if ('stringValue' in value) return value.stringValue
  if ('timestampValue' in value) return new Date(String(value.timestampValue))
  if ('arrayValue' in value) {
    const arr = value.arrayValue as { values?: FirestoreValue[] }
    return (arr.values || []).map(fromFirestoreValue)
  }
  if ('mapValue' in value) {
    const map = value.mapValue as { fields?: Record<string, FirestoreValue> }
    return fromFirestoreFields(map.fields || {})
  }
  return undefined
}

async function firestoreFetch(path: string, init: RequestInit, requestBody: string | null) {
  const id = beginTransfer(init.method || 'GET', path, requestBody)
  try {
    const res = await fetch(`${WORKER_URL}/firestore${path}`, init)
    let body = ''
    try {
      body = await res.clone().text()
    } catch {
    }
    endTransfer(id, res.status, body)
    return res
  } catch (error) {
    failTransfer(id, error instanceof Error ? error.message : String(error))
    throw error
  }
}

export async function setDoc(collection: string, data: Record<string, unknown>) {
  const user = currentUser
  if (!user) throw new Error('Not signed in')
  const auth = await authHeader()
  const body = JSON.stringify({ fields: toFirestoreFields(data) })
  const res = await firestoreFetch(
    docPath(collection, user.uid),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth },
      body,
    },
    body,
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`setDoc failed: ${JSON.stringify(err)}`)
  }
  return res.json()
}

export async function getDoc(collection: string): Promise<Record<string, unknown> | null> {
  const user = currentUser
  if (!user) throw new Error('Not signed in')
  const auth = await authHeader()
  const res = await firestoreFetch(docPath(collection, user.uid), { headers: auth }, null)
  if (res.status === 404) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`getDoc failed: ${JSON.stringify(err)}`)
  }
  const doc = (await res.json()) as { fields?: Record<string, FirestoreValue> }
  return doc.fields ? fromFirestoreFields(doc.fields) : null
}

export async function deleteDoc(collection: string) {
  const user = currentUser
  if (!user) throw new Error('Not signed in')
  const auth = await authHeader()
  const res = await firestoreFetch(
    docPath(collection, user.uid),
    {
      method: 'DELETE',
      headers: auth,
    },
    null,
  )
  if (!res.ok && res.status !== 404) throw new Error(`deleteDoc failed: ${res.status}`)
}

function restoreSession() {
  try {
    const user = readStoredSession(localStorage.getItem(SESSION_KEY))
    if (!user) return
    currentUser = user
    if (Date.now() >= user.expiresAt) void refreshIdToken()
    else scheduleRefresh()
  } catch {
  }
}

restoreSession()

window.addEventListener('storage', (event) => {
  if (event.key !== SESSION_KEY && event.key !== null) return
  currentUser = readStoredSession(event.key === null ? null : event.newValue)
  scheduleRefresh()
  notify()
  if (currentUser && Date.now() >= currentUser.expiresAt) void refreshIdToken()
})


export type AuthProvider = { providerId: string; displayName?: string; email?: string }

async function postAuth<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!currentUser) throw new Error('Not signed in')
  if (Date.now() >= currentUser.expiresAt - 30_000) await refreshIdToken()
  if (!currentUser) throw new Error('Not signed in')

  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, idToken: currentUser.idToken }),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: unknown }
  if (!res.ok) throw new Error(authErrorMessage(data, 'Request failed'))
  return data
}

export async function updateProfile(displayName: string) {
  const data = await postAuth<{ displayName?: string }>('/auth/update', { displayName })
  if (!currentUser) return null
  currentUser = { ...currentUser, displayName: data.displayName || displayName }
  persistSession()
  notify()
  return currentUser
}

export async function changePassword(newPassword: string) {
  await postAuth('/auth/password', { newPassword })
}

export async function resetPassword(email: string) {
  const res = await fetch(`${WORKER_URL}/auth/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: unknown }
  if (!res.ok) throw new Error(authErrorMessage(data, 'Could not send the reset email'))
}

export async function deleteAccount() {
  await postAuth('/auth/delete')
  signOut()
}

export async function getProviders(): Promise<AuthProvider[]> {
  if (!currentUser) return []
  const data = await postAuth<{ providers?: AuthProvider[] }>('/auth/providers')
  return data.providers ?? []
}

export async function unlinkProvider(providerId: string) {
  await postAuth('/auth/unlink', { providerId })
}

export async function saveProfilePhoto(dataUrl: string) {
  await setDoc('profile_photo', { dataUrl, lastSync: new Date() })
}

export async function loadProfilePhoto(): Promise<string> {
  try {
    const doc = await getDoc('profile_photo')
    return typeof doc?.dataUrl === 'string' ? doc.dataUrl : ''
  } catch {
    return ''
  }
}

export async function getAIUsage(): Promise<{ remaining: number; max: number } | null> {
  if (!currentUser) return null
  if (Date.now() >= currentUser.expiresAt - 30_000) await refreshIdToken()
  if (!currentUser) return null
  try {
    const res = await fetch('https://api.plutoniumnet.work/ai/ratelimit', {
      headers: { Authorization: `Bearer ${currentUser.idToken}` },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { remaining?: unknown; max?: unknown }
    if (typeof data.remaining !== 'number' || typeof data.max !== 'number') return null
    return { remaining: data.remaining, max: data.max }
  } catch {
    return null
  }
}

type OAuthUser = {
  uid: string
  idToken: string
  refreshToken: string
  expiresIn: string
  displayName?: string
  email?: string
  photoUrl?: string
}

export function signInWithOAuth(provider: 'google' | 'github') {
  return new Promise<CloudUser>((resolve, reject) => {
    const popup = window.open(
      `${WORKER_URL}/auth/oauth/start?provider=${provider}`,
      'plu_oauth',
      'width=520,height=620,left=200,top=100,toolbar=0,menubar=0,location=0',
    )
    if (!popup) {
      reject(new Error('The sign-in window was blocked. Allow popups for this site and try again.'))
      return
    }

    let timer = 0
    const stop = () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(timer)
    }

    function onMessage(event: MessageEvent) {
      if (!event.data || event.data.type !== 'plu_oauth') return
      stop()
      let parsed: { error?: string; user?: OAuthUser }
      try {
        parsed = JSON.parse(String(event.data.payload))
      } catch {
        reject(new Error('Sign-in returned an unreadable response.'))
        return
      }
      if (parsed.error) {
        reject(new Error(parsed.error))
        return
      }
      const u = parsed.user
      if (!u?.idToken) {
        reject(new Error('Sign-in returned no session.'))
        return
      }
      setUser({
        uid: u.uid,
        idToken: u.idToken,
        refreshToken: u.refreshToken,
        expiresAt: Date.now() + parseInt(u.expiresIn, 10) * 1000,
        displayName: u.displayName || '',
        email: u.email || '',
        photoUrl: u.photoUrl || '',
      })
      if (currentUser) resolve(currentUser)
    }

    window.addEventListener('message', onMessage)
    timer = window.setInterval(() => {
      if (!popup.closed) return
      stop()
      reject(new Error('The sign-in window was closed.'))
    }, 500)
  })
}

export function linkWithOAuth(provider: 'google' | 'github') {
  return new Promise<void>((resolve, reject) => {
    if (!currentUser) {
      reject(new Error('Not signed in'))
      return
    }
    const popup = window.open(
      `${WORKER_URL}/auth/oauth/start?provider=${provider}&mode=link`,
      'plu_oauth_link',
      'width=520,height=620,left=200,top=100,toolbar=0,menubar=0,location=0',
    )
    if (!popup) {
      reject(new Error('The sign-in window was blocked. Allow popups for this site and try again.'))
      return
    }

    let timer = 0
    const stop = () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(timer)
    }

    function onMessage(event: MessageEvent) {
      if (!event.data || event.data.type !== 'plu_oauth_link') return
      stop()
      let parsed: { error?: string; link?: { providerId?: string; accessToken?: string } }
      try {
        parsed = JSON.parse(String(event.data.payload))
      } catch {
        reject(new Error('Linking returned an unreadable response.'))
        return
      }
      if (parsed.error) {
        reject(new Error(parsed.error))
        return
      }
      const link = parsed.link
      if (!link?.providerId || !link.accessToken) {
        reject(new Error('Linking returned no credential.'))
        return
      }
      void postAuth('/auth/link', { providerId: link.providerId, oauthAccessToken: link.accessToken }).then(
        () => resolve(),
        (error: unknown) => reject(error instanceof Error ? error : new Error('Could not link that provider')),
      )
    }

    window.addEventListener('message', onMessage)
    timer = window.setInterval(() => {
      if (!popup.closed) return
      stop()
      reject(new Error('The linking window was closed.'))
    }, 500)
  })
}
