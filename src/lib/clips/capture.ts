import { addClip, type ClipMeta, type ClipSource } from './db'
import { makeThumbnail } from './media'

const CHANNEL = 'plutonium-clip'
const HELLO_TIMEOUT = 1500
const START_TIMEOUT = 15000
const STOP_TIMEOUT = 60000

export type CaptureRect = { x: number; y: number; width: number; height: number }

export type ClipCaptureState = {
  status: 'idle' | 'starting' | 'recording' | 'saving'
  startedAt: number
  label: string
}

export type ClipTarget = {
  rect: () => CaptureRect | null
  label: () => string
  source: ClipSource
}

type StopResult = {
  blob: Blob
  mime: string
  width: number
  height: number
  duration: number
}

/* ------------------------------------------------------------------ *
 * Capture state
 * ------------------------------------------------------------------ */

let state: ClipCaptureState = { status: 'idle', startedAt: 0, label: '' }
const stateListeners = new Set<() => void>()

export function getClipCaptureState(): ClipCaptureState {
  return state
}

export function subscribeClipCapture(listener: () => void): () => void {
  stateListeners.add(listener)
  return () => {
    stateListeners.delete(listener)
  }
}

function setState(patch: Partial<ClipCaptureState>) {
  state = { ...state, ...patch }
  for (const listener of stateListeners) listener()
}

/* ------------------------------------------------------------------ *
 * Notices
 * ------------------------------------------------------------------ */

export type ClipNotice = {
  id: number
  text: string
  tone: 'info' | 'error'
  studio: boolean
}

let notice: ClipNotice | null = null
const noticeListeners = new Set<() => void>()
let noticeSeq = 1

export function getClipNotice(): ClipNotice | null {
  return notice
}

export function subscribeClipNotice(listener: () => void): () => void {
  noticeListeners.add(listener)
  return () => {
    noticeListeners.delete(listener)
  }
}

export function dismissClipNotice() {
  if (!notice) return
  notice = null
  for (const listener of noticeListeners) listener()
}

export function pushClipNotice(text: string, tone: 'info' | 'error' = 'info', studio = false) {
  notice = { id: noticeSeq++, text, tone, studio }
  for (const listener of noticeListeners) listener()
}

/* ------------------------------------------------------------------ *
 * Extension availability
 * ------------------------------------------------------------------ */

export type ClipAvailability = 'checking' | 'ready' | 'missing'

let availability: ClipAvailability = 'checking'
const availabilityListeners = new Set<() => void>()

export function getClipAvailability(): ClipAvailability {
  return availability
}

export function subscribeClipAvailability(listener: () => void): () => void {
  availabilityListeners.add(listener)
  return () => {
    availabilityListeners.delete(listener)
  }
}

function setAvailability(next: ClipAvailability) {
  if (availability === next) return
  availability = next
  for (const listener of availabilityListeners) listener()
}

let probeRetries = 0
let probeTimer: number | null = null

export async function probeClipExtension(): Promise<boolean> {
  if (availability === 'ready') return true
  const ok = await hello()
  setAvailability(ok ? 'ready' : 'missing')
  if (ok) {
    probeRetries = 0
    return true
  }
  // The bridge can turn up after the first look (a late injection, an install on
  // an open tab), so keep looking for a while instead of staying "missing" for
  // the life of the page.
  if (probeRetries < 6 && probeTimer == null) {
    probeRetries += 1
    probeTimer = window.setTimeout(() => {
      probeTimer = null
      if (availability !== 'ready') void probeClipExtension()
    }, 2500)
  }
  return false
}

const MISSING_EXTENSION =
  'The clip recorder is not reachable. Install Plutonium Clip from the Chrome Web Store and reload Plutonium — it works on any site that hosts Plutonium.'

/* ------------------------------------------------------------------ *
 * Bridge
 * ------------------------------------------------------------------ */

let bridgeReady = false
let helloRequest: Promise<boolean> | null = null
let resolveHello: ((ok: boolean) => void) | null = null

let pendingStart: ((result: { ok: boolean; error?: string }) => void) | null = null
let pendingStop: ((result: StopResult | { error: string }) => void) | null = null
// Pieces arrive one at a time and are decoded as they land, so the page never
// holds one giant base64 string.
let chunkParts: Uint8Array[] = []

let session: { label: string; source: ClipSource; startedAt: number } | null = null

const targets: ClipTarget[] = []

function post(payload: Record<string, unknown>) {
  window.postMessage({ channel: CHANNEL, dir: 'page', ...payload }, '*')
}

function hello(): Promise<boolean> {
  if (bridgeReady) return Promise.resolve(true)
  if (helloRequest) return helloRequest

  helloRequest = new Promise<boolean>((resolve) => {
    let settled = false
    const timer = window.setTimeout(() => finish(false), HELLO_TIMEOUT)

    function finish(ok: boolean) {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolveHello = null
      if (ok) {
        bridgeReady = true
        setAvailability('ready')
        helloRequest = null
      } else {
        helloRequest = null
      }
      resolve(ok)
    }

    resolveHello = finish
    post({ type: 'hello' })
  })

  return helloRequest
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function clipTitle(label: string, createdAt: number) {
  const clean = label.trim() || 'Clip'
  let stamp = ''
  try {
    stamp = new Date(createdAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    stamp = ''
  }
  return stamp ? `${clean} · ${stamp}` : clean
}

function handleMessage(event: MessageEvent) {
  if (event.source !== window) return
  const data = event.data as Record<string, unknown> | null
  if (!data || data.channel !== CHANNEL || data.dir !== 'ext') return

  const type = data.type
  if (type === 'ready') {
    bridgeReady = true
    setAvailability('ready')
    resolveHello?.(true)
    return
  }
  if (type === 'started') {
    pendingStart?.({ ok: true })
    return
  }
  if (type === 'failed') {
    pendingStart?.({ ok: false, error: typeof data.error === 'string' ? data.error : undefined })
    return
  }
  if (type === 'chunk') {
    if (typeof data.data !== 'string' || !data.data) return
    try {
      chunkParts.push(base64ToBytes(data.data))
    } catch {
      // A piece that cannot be decoded is dropped; the rest still assembles.
    }
    return
  }
  if (type === 'done') {
    const parts = chunkParts
    chunkParts = []
    const mime = typeof data.mime === 'string' && data.mime ? data.mime : 'video/webm'
    let blob: Blob
    try {
      blob = new Blob(parts as BlobPart[], { type: mime })
    } catch {
      pendingStop?.({ error: 'The clip could not be read back.' })
      return
    }
    pendingStop?.({
      blob,
      mime: blob.type || mime,
      width: Number(data.width) || 0,
      height: Number(data.height) || 0,
      duration: Number(data.duration) || 0,
    })
    return
  }
  if (type === 'error') {
    chunkParts = []
    pendingStop?.({ error: typeof data.message === 'string' ? data.message : 'The clip failed.' })
    return
  }
  if (type === 'toolbar') {
    if (state.status === 'recording') void stopClipCapture()
    else if (state.status === 'idle') void startClipCapture(currentTarget())
  }
}

window.addEventListener('message', handleMessage)

/* ------------------------------------------------------------------ *
 * Targets
 * ------------------------------------------------------------------ */

export function captureRectOf(element: HTMLElement | null | undefined): CaptureRect | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const x = Math.max(0, Math.round(rect.left))
  const y = Math.max(0, Math.round(rect.top))
  const width = Math.min(Math.round(rect.width), Math.max(0, Math.round(window.innerWidth) - x))
  const height = Math.min(Math.round(rect.height), Math.max(0, Math.round(window.innerHeight) - y))
  if (width < 40 || height < 40) return null
  return { x, y, width: width - (width % 2), height: height - (height % 2) }
}

function currentTarget(): ClipTarget {
  return targets[targets.length - 1] ?? {
    rect: () => captureRectOf(document.getElementById('page-frame')),
    label: () => 'Plutonium clip',
    source: 'tab',
  }
}

export function registerClipTarget(target: ClipTarget): () => void {
  targets.push(target)
  if (availability !== 'ready') void probeClipExtension()

  return () => {
    const index = targets.lastIndexOf(target)
    if (index !== -1) targets.splice(index, 1)
  }
}

/* ------------------------------------------------------------------ *
 * Recording
 * ------------------------------------------------------------------ */

export async function startClipCapture(target: ClipTarget = currentTarget()): Promise<boolean> {
  if (state.status !== 'idle') return false

  const rect = target.rect()
  if (!rect) {
    pushClipNotice('That area is too small to record.', 'error')
    return false
  }

  setState({ status: 'starting', label: target.label(), startedAt: 0 })

  if (!(await hello())) {
    setState({ status: 'idle', label: '', startedAt: 0 })
    setAvailability('missing')
    pushClipNotice(MISSING_EXTENSION, 'error')
    return false
  }

  const requestId = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const started = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const timer = window.setTimeout(() => {
      pendingStart = null
      resolve({ ok: false, error: 'The recorder did not answer. Reload the Plutonium tab and try again.' })
    }, START_TIMEOUT)
    pendingStart = (result) => {
      window.clearTimeout(timer)
      pendingStart = null
      resolve(result)
    }
    post({ type: 'start', requestId, rect })
  })

  if (!started.ok) {
    setState({ status: 'idle', label: '', startedAt: 0 })
    pushClipNotice(started.error || 'Recording could not start.', 'error')
    return false
  }

  chunkParts = []
  session = { label: target.label(), source: target.source, startedAt: Date.now() }
  setState({ status: 'recording', startedAt: session.startedAt, label: session.label })
  return true
}

export async function stopClipCapture(): Promise<boolean> {
  if (state.status !== 'recording' || !session) return false

  const active = session
  setState({ status: 'saving' })

  const result = await new Promise<StopResult | { error: string }>((resolve) => {
    const timer = window.setTimeout(() => {
      pendingStop = null
      resolve({ error: 'The clip did not finish saving.' })
    }, STOP_TIMEOUT)
    pendingStop = (value) => {
      window.clearTimeout(timer)
      pendingStop = null
      resolve(value)
    }
    post({ type: 'stop' })
  })

  session = null

  if ('error' in result) {
    chunkParts = []
    setState({ status: 'idle', label: '', startedAt: 0 })
    pushClipNotice(result.error, 'error')
    return false
  }

  try {
    const createdAt = Date.now()
    const thumb = await makeThumbnail(result.blob)
    const meta: ClipMeta = {
      id: `clip-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      title: clipTitle(active.label, createdAt),
      createdAt,
      duration: Math.max(0, Math.round(result.duration)),
      width: result.width,
      height: result.height,
      size: result.blob.size,
      mime: result.mime,
      thumb,
      favorite: false,
      source: active.source,
    }
    await addClip(meta, result.blob)
    setState({ status: 'idle', label: '', startedAt: 0 })
    pushClipNotice(`Clip saved · ${Math.round(meta.duration / 100) / 10}s`, 'info', true)
    return true
  } catch (error) {
    setState({ status: 'idle', label: '', startedAt: 0 })
    pushClipNotice(error instanceof Error ? error.message : 'The clip could not be stored.', 'error')
    return false
  }
}

export async function toggleClipCapture(target: ClipTarget = currentTarget()): Promise<boolean> {
  if (state.status === 'recording') return stopClipCapture()
  return startClipCapture(target)
}

// Probe once on load so the UI knows whether clip recording is available at
// all, and re-check when the window regains focus after an install.
void probeClipExtension()
window.addEventListener('focus', () => {
  if (availability === 'missing') void probeClipExtension()
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && availability === 'missing') void probeClipExtension()
})
