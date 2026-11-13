/**
 * Plutonium account + cloud store for v2.
 *
 * Ported from v1's js/cloud-store.js: same worker endpoints, same Firestore
 * document encoding, same token refresh. The deliberate difference is storage:
 * v1 mirrors the session into localStorage (`plu_user`); v2 keeps it in memory
 * and mirrors it into sessionStorage so a reload inside the same tab survives,
 * while nothing is written to localStorage and nothing outlives the tab.
 *
 * Tab content itself is never stored on the device — see lib/tab-sync.ts.
 */

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
    if (currentUser) sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentUser))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* storage blocked: the session simply stays in memory */
  }
}

function notify() {
  authListeners.forEach((fn) => {
    try {
      fn(currentUser)
    } catch {
      /* one broken listener must not break the others */
    }
  })
}

function setUser(user: CloudUser | null) {
  currentUser = user
  persistSession()
  scheduleRefresh()
  notify()
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
      signOut()
      return
    }
    const cfg = (await cfgRes.json()) as { apiKey?: string }
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${cfg.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: user.refreshToken }),
    })
    if (!res.ok) {
      signOut()
      return
    }
    const data = (await res.json()) as { id_token: string; expires_in: string }
    if (!currentUser) return
    currentUser = {
      ...currentUser,
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

type FirestoreValue = Record<string, unknown>

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

function fromFirestoreFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
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

export async function setDoc(collection: string, data: Record<string, unknown>) {
  const user = currentUser
  if (!user) throw new Error('Not signed in')
  const auth = await authHeader()
  const res = await fetch(`${WORKER_URL}/firestore${docPath(collection, user.uid)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  })
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
  const res = await fetch(`${WORKER_URL}/firestore${docPath(collection, user.uid)}`, { headers: auth })
  if (res.status === 404) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`getDoc failed: ${JSON.stringify(err)}`)
  }
  const doc = (await res.json()) as { fields?: Record<string, FirestoreValue> }
  return doc.fields ? fromFirestoreFields(doc.fields) : null
}

/** Restore the session mirrored for this tab only — never from localStorage. */
function restoreSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return
    const user = JSON.parse(raw) as CloudUser
    if (!user?.idToken) return
    currentUser = user
    if (Date.now() >= user.expiresAt) void refreshIdToken()
    else scheduleRefresh()
    window.setTimeout(notify, 0)
  } catch {
    /* corrupt session: stay signed out */
  }
}

restoreSession()
