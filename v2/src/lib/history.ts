/**
 * Browsing history, ported from v1's js/history.js.
 *
 * Same entry shape and same Firestore document (`history/_default`), but the
 * device copy is gone: entries live in memory and are pulled from the account on
 * sign-in, pushed back on a debounce. Nothing is written to localStorage.
 */

import { getDoc, isSignedIn, onAuthChange, setDoc } from './cloud-store'

export type HistoryType = 'web' | 'search'

export type HistoryEntry = {
  id: string
  type: HistoryType
  title: string
  sub: string
  href: string
  engine: string
  ts: number
}

const DOC_NAME = 'history'
const MAX_ENTRIES = 400
const PUSH_DEBOUNCE_MS = 1500
const REPEAT_WINDOW_MS = 5000

let entries: HistoryEntry[] = []
let deleted: Record<string, number> = {}
const listeners = new Set<() => void>()
let pushTimer: number | null = null
let lastPushHash = ''

function emit() {
  listeners.forEach((fn) => fn())
}

export function subscribeHistory(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getHistory() {
  return entries
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function stateHash() {
  return entries.length + ':' + (entries[0] ? `${entries[0].id}:${entries[0].ts}` : '') + '|' + Object.keys(deleted).sort().join(',')
}

function isDeleted(entry: HistoryEntry) {
  const ts = deleted[entry.id]
  return !!ts && ts >= entry.ts
}

function merge(incoming: HistoryEntry[]) {
  const byId = new Map<string, HistoryEntry>()
  ;[...entries, ...incoming].forEach((entry) => {
    if (!entry?.id || isDeleted(entry)) return
    const existing = byId.get(entry.id)
    if (!existing || entry.ts > existing.ts) byId.set(entry.id, entry)
  })
  return [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, MAX_ENTRIES)
}

async function push() {
  if (!isSignedIn()) return
  const hash = stateHash()
  if (hash === lastPushHash) return
  try {
    await setDoc(DOC_NAME, { entries, deleted, lastSync: new Date() })
    lastPushHash = hash
  } catch (error) {
    console.warn('[history] push failed:', error)
  }
}

function schedulePush() {
  if (pushTimer) return
  pushTimer = window.setTimeout(() => {
    pushTimer = null
    void push()
  }, PUSH_DEBOUNCE_MS)
}

export async function pullHistory() {
  if (!isSignedIn()) return
  try {
    const doc = await getDoc(DOC_NAME)
    const remote = Array.isArray(doc?.entries) ? (doc.entries as HistoryEntry[]) : []
    const remoteDeleted = doc?.deleted && typeof doc.deleted === 'object' ? (doc.deleted as Record<string, number>) : {}
    deleted = { ...remoteDeleted, ...deleted }
    entries = merge(remote.filter((entry) => entry && entry.type && entry.ts && entry.title))
    lastPushHash = ''
    emit()
    void push()
  } catch (error) {
    console.warn('[history] pull failed:', error)
  }
}

export function recordVisit(input: { type: HistoryType; title: string; href: string; sub?: string; engine?: string }) {
  const title = String(input.title || '').slice(0, 300)
  if (!title || !input.href) return null

  const head = entries[0]
  const href = input.href
  if (head && head.type === input.type && head.href === href && Date.now() - head.ts < REPEAT_WINDOW_MS) {
    head.ts = Date.now()
    emit()
    schedulePush()
    return head
  }

  const entry: HistoryEntry = {
    id: makeId(),
    type: input.type,
    title,
    sub: input.sub ? String(input.sub).slice(0, 200) : '',
    href,
    engine: input.engine || '',
    ts: Date.now(),
  }
  entries = [entry, ...entries].slice(0, MAX_ENTRIES)
  emit()
  schedulePush()
  return entry
}

export function removeEntry(id: string) {
  if (!entries.some((entry) => entry.id === id)) return
  deleted = { ...deleted, [id]: Date.now() }
  entries = entries.filter((entry) => entry.id !== id)
  emit()
  void push()
}

export function clearHistory() {
  if (!entries.length) return
  const ts = Date.now()
  entries.forEach((entry) => {
    deleted[entry.id] = ts
  })
  entries = []
  emit()
  void push()
}

onAuthChange((user) => {
  if (user) void pullHistory()
  else {
    entries = []
    deleted = {}
    lastPushHash = ''
    emit()
  }
})
