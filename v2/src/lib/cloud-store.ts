/**
 * Port of the parts of v1's cloud store (js/cloud-store.js) that tab sync needs:
 * session restore, id-token refresh, and Firestore document get/set through the
 * Plutonium API worker. Sign-in, OAuth and the RTDB helpers are not ported —
 * nothing in v2 uses them yet.
 *
 * The session lives in localStorage under `plu_user`, exactly as v1 writes it, so
 * a session created by v1 on this origin is picked up here unchanged.
 */

const WORKER_URL = 'https://api.plutoniumnet.work'
const SESSION_KEY = 'plu_user'
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

let currentUser: CloudUser | null = null
let refreshTimer: number | null = null
let authListeners: Array<(user: CloudUser | null) => void> = []

function persistSession() {
  try {
    if (currentUser) localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* private mode or quota: the session simply does not survive a reload */
  }
}

function notify() {
  authListeners.forEach((fn) => {
    try {
      fn(currentUser)
    } catch {
      /* a broken listener must not break the others */
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

async function refreshIdToken() {
  if (!currentUser?.refreshToken) return
  try {
    const cfgRes = await fetch(`${WORKER_URL}/config`)
    if (!cfgRes.ok) {
      setUser(null)
      return
    }
    const cfg = (await cfgRes.json()) as { apiKey?: string }
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${cfg.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: currentUser.refreshToken }),
    })
    if (!res.ok) {
      setUser(null)
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
  if (!currentUser) throw new Error('[cloud-store] Not signed in')
  if (Date.now() >= currentUser.expiresAt - 30_000) await refreshIdToken()
  if (!currentUser) throw new Error('[cloud-store] Not signed in')
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
  if (!user) throw new Error('[cloud-store] Not signed in')
  const auth = await authHeader()
  const res = await fetch(`${WORKER_URL}/firestore${docPath(collection, user.uid)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`[cloud-store] setDoc failed: ${JSON.stringify(err)}`)
  }
  return res.json()
}

export async function getDoc(collection: string): Promise<Record<string, unknown> | null> {
  const user = currentUser
  if (!user) throw new Error('[cloud-store] Not signed in')
  const auth = await authHeader()
  const res = await fetch(`${WORKER_URL}/firestore${docPath(collection, user.uid)}`, { headers: auth })
  if (res.status === 404) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`[cloud-store] getDoc failed: ${JSON.stringify(err)}`)
  }
  const doc = (await res.json()) as { fields?: Record<string, FirestoreValue> }
  return doc.fields ? fromFirestoreFields(doc.fields) : null
}

/** v1 restores the session at module load; getDoc/setDoc depend on that. */
function restoreSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
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
