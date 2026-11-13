/**
 * Account-backed preferences.
 *
 * Small, user-level settings that used to live only in the tab (pins, the
 * chosen engine, the open AI character) are stored in one Firestore document on
 * the signed-in account, so they follow the user between devices and reloads.
 * Writes are debounced and best-effort: signed out, the feature simply behaves
 * as it did before.
 */

import { getDoc, onAuthChange, setDoc } from './cloud-store'

const DOC = 'preferences'
const WRITE_DELAY_MS = 600

type Prefs = Record<string, unknown>

let cache: Prefs = {}
let hydrated = false
let loading: Promise<void> | null = null
let timer: number | null = null

/** Read the account document once. Safe to call from anywhere, any number of times. */
export function loadPrefs(): Promise<void> {
  if (loading) return loading
  loading = getDoc(DOC)
    .then((doc) => {
      // Local edits made while the read was in flight win over the stored copy.
      cache = { ...(doc || {}), ...cache }
    })
    .catch(() => {
      /* signed out or offline: keep whatever this session has */
    })
    .finally(() => {
      hydrated = true
    })
  return loading
}

export function getPref<T>(key: string): T | undefined {
  return cache[key] as T | undefined
}

export function setPref(key: string, value: unknown) {
  cache = { ...cache, [key]: value }
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = null
    void flush()
  }, WRITE_DELAY_MS)
}

// The first read may happen before sign-in; re-read once an account appears.
let lastUid: string | null = null
onAuthChange((user) => {
  const uid = user?.uid ?? null
  if (uid === lastUid) return
  lastUid = uid
  loading = null
  hydrated = false
  cache = {}
  if (uid) void loadPrefs()
})

async function flush() {
  if (!hydrated) await loadPrefs()
  try {
    await setDoc(DOC, cache)
  } catch {
    /* signed out: the preference stays in memory */
  }
}
