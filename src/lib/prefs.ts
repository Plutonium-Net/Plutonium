import { getDoc, onAuthChange, setDoc } from './cloud-store'

const DOC = 'preferences'
const WRITE_DELAY_MS = 600

type Prefs = Record<string, unknown>

let cache: Prefs = {}
let hydrated = false
let loading: Promise<void> | null = null
let timer: number | null = null

export function loadPrefs(): Promise<void> {
  if (loading) return loading
  loading = getDoc(DOC)
    .then((doc) => {
      cache = { ...(doc || {}), ...cache }
    })
    .catch(() => {
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
  }
}
