/**
 * Cloud saves for games, ported from v1's `games.js` save sync.
 *
 * The game page loads PluStore (`g.cdn.plutoniumnet.work/js/plustore.js`), which
 * serialises the whole save into one text document and talks to its host over
 * postMessage: it is the only party that can reach local storage inside its own
 * origin, and this shell is the only party that can reach the network:
 *
 *   game  -> shell   { plu: true, type: 'plu_text_ready' }
 *                    { plu: true, type: 'plu_text_data', doc }
 *   shell -> game    { plu: true, type: 'plu_text_restore', doc }
 *                    { plu: true, type: 'plu_text_request' }
 *
 * Each game's document is one cloud record keyed by its id (`game_saves/<id>`),
 * so what is stored is exactly what the game wrote. Nothing is written to the
 * device: the record lives in the signed-in user's account.
 */

import { getDoc, isSignedIn, onAuthChange, setDoc } from './cloud-store'

export const SAVE_DOC_PREFIX = 'game_saves/'

const WRITE_DELAY = 1200
const RETRY_DELAY = 15000
const MAX_CHARS = 900_000
/** A document with no blocks has never saved anything worth keeping. */
const SAVE_BLOCK = /^@/m
/** How long a launched game gets to announce its save store. */
const READY_TIMEOUT = 12000

export type SaveStatus = 'signedout' | 'loading' | 'ready' | 'saving' | 'saved' | 'error' | 'silent'

export type SaveState = {
  status: SaveStatus
  savedAt: number | null
  detail?: string
}

type HostMessage = { plu?: boolean; type?: string; doc?: unknown }

export type SaveBridge = {
  /** Pull the cloud document and hand it to the game once it is listening. */
  restore(): void
  /** Ask the game to post its current document (used when closing). */
  requestSnapshot(): void
  /** Flush any queued document immediately. */
  saveNow(): void
  getState(): SaveState
  subscribe(listener: () => void): () => void
  dispose(): void
}

export function createSaveBridge(gameId: string, getFrame: () => HTMLIFrameElement | null): SaveBridge {
  let state: SaveState = { status: 'ready', savedAt: null }
  let pendingDoc: string | null = null
  let applied = false
  let queued: string | null = null
  let signature = ''
  let writeTimer: number | null = null
  let readyTimer: number | null = null
  let retryAfter = 0
  let disposed = false
  const listeners = new Set<() => void>()

  function setState(next: Partial<SaveState>) {
    state = { ...state, ...next }
    listeners.forEach((listener) => listener())
  }

  function post(message: Record<string, unknown>) {
    const frame = getFrame()
    const win = frame?.contentWindow
    if (!win) return
    try {
      win.postMessage({ plu: true, ...message }, '*')
    } catch {
      /* the frame went away mid-post */
    }
  }

  function pushPending() {
    if (!pendingDoc || applied) return
    post({ type: 'plu_text_restore', doc: pendingDoc })
    applied = true
  }

  function flush() {
    if (writeTimer) {
      window.clearTimeout(writeTimer)
      writeTimer = null
    }
    const doc = queued
    queued = null
    if (!doc || doc === signature || disposed) return

    if (doc.length > MAX_CHARS) {
      signature = doc
      setState({ status: 'error', detail: 'This save is too large to upload' })
      return
    }

    setState({ status: 'saving' })
    void setDoc(SAVE_DOC_PREFIX + gameId, { doc, updatedAt: Date.now() })
      .then(() => {
        if (disposed) return
        signature = doc
        retryAfter = 0
        setState({ status: 'saved', savedAt: Date.now(), detail: undefined })
      })
      .catch((err: unknown) => {
        if (disposed) return
        retryAfter = Date.now() + RETRY_DELAY
        setState({ status: 'error', detail: err instanceof Error ? err.message : 'Save failed' })
      })
  }

  function queueWrite(doc: string) {
    if (!isSignedIn()) {
      setState({ status: 'signedout' })
      return
    }
    if (doc === signature) return
    if (Date.now() < retryAfter) return
    queued = doc
    if (writeTimer) window.clearTimeout(writeTimer)
    writeTimer = window.setTimeout(flush, WRITE_DELAY)
  }

  function onMessage(event: MessageEvent) {
    const frame = getFrame()
    if (!frame || event.source !== frame.contentWindow) return
    const data = event.data as HostMessage | null
    if (!data || data.plu !== true) return

    if (data.type === 'plu_text_ready') {
      if (readyTimer) {
        window.clearTimeout(readyTimer)
        readyTimer = null
      }
      if (state.status === 'silent') setState({ status: 'ready' })
      pushPending()
      window.setTimeout(() => post({ type: 'plu_text_request' }), 1000)
      return
    }

    if (data.type === 'plu_text_data' && typeof data.doc === 'string') {
      const doc = data.doc
      if (!SAVE_BLOCK.test(doc)) return
      queueWrite(doc)
    }
  }

  function restore() {
    if (!isSignedIn()) {
      setState({ status: 'signedout' })
      return
    }
    setState({ status: 'loading' })
    void getDoc(SAVE_DOC_PREFIX + gameId)
      .then((record) => {
        if (disposed) return
        const doc = typeof record?.doc === 'string' ? (record.doc as string) : ''
        if (doc) {
          pendingDoc = doc
          signature = doc
          pushPending()
        }
        setState({ status: 'ready' })
      })
      .catch((err: unknown) => {
        if (disposed) return
        setState({ status: 'error', detail: err instanceof Error ? err.message : 'Could not load the save' })
      })
  }

  window.addEventListener('message', onMessage)

  const stopAuth = onAuthChange(() => {
    if (disposed) return
    if (isSignedIn()) restore()
    else setState({ status: 'signedout' })
  })

  // Silence means the page is not running PluStore at all, which is a fault to
  // report rather than a game with nothing to save.
  readyTimer = window.setTimeout(() => {
    readyTimer = null
    if (state.status === 'saved' || state.status === 'saving') return
    setState({ status: 'silent', detail: 'This game is not reporting its saves' })
  }, READY_TIMEOUT)

  return {
    restore,
    requestSnapshot() {
      post({ type: 'plu_text_request' })
    },
    saveNow() {
      post({ type: 'plu_text_request' })
      if (queued) flush()
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      // A snapshot that landed moments before the frame was torn down still goes
      // out: the write is in flight, so nothing waits on the debounce any more.
      flush()
      disposed = true
      window.removeEventListener('message', onMessage)
      stopAuth()
      if (readyTimer) window.clearTimeout(readyTimer)
      if (writeTimer) window.clearTimeout(writeTimer)
      listeners.clear()
    },
  }
}
