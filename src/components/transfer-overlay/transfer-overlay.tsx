import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { currentSession, fromFirestoreFields, type FirestoreValue } from '@/lib/cloud-store'
import { getTransfers, subscribeTransfers, type TransferEntry } from '@/lib/transfer-log'
import './transfer-overlay.css'

const MAX_VALUE = 120
const MAX_DEPTH = 4
const MAX_ITEMS = 12
const KEY_COLUMN = 18
const TYPE_INTERVAL_MS = 30
const TYPE_CATCHUP_TICKS = 50

type Field = { depth: number; key: string; value: string }

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE)}…` : value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (value instanceof Date) return value.toLocaleString()
  return String(value)
}

function collectionSize(value: unknown): number | null {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.keys(value).length
  return null
}

function addFields(source: Record<string, unknown>, depth: number, out: Field[]) {
  for (const [key, value] of Object.entries(source)) {
    const size = collectionSize(value)
    if (size !== null && size > MAX_ITEMS) {
      out.push({ depth, key, value: `${size} ${Array.isArray(value) ? 'items' : 'entries'}` })
      continue
    }

    if (depth >= MAX_DEPTH) {
      out.push({ depth, key, value: JSON.stringify(value) ?? '—' })
      continue
    }

    if (Array.isArray(value)) {
      if (!value.length) {
        out.push({ depth, key, value: 'none' })
        continue
      }
      if (value.every((item) => item === null || typeof item !== 'object')) {
        const joined = value.map(formatValue).join(', ')
        out.push({ depth, key, value: joined.length > MAX_VALUE ? `${joined.slice(0, MAX_VALUE)}…` : joined })
        continue
      }
      out.push({ depth, key, value: '' })
      value.forEach((item, index) => {
        if (item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date)) {
          out.push({ depth: depth + 1, key: String(index + 1), value: '' })
          addFields(item as Record<string, unknown>, depth + 2, out)
        } else {
          out.push({ depth: depth + 1, key: String(index + 1), value: formatValue(item) })
        }
      })
      continue
    }

    if (value && typeof value === 'object' && !(value instanceof Date)) {
      out.push({ depth, key, value: '' })
      addFields(value as Record<string, unknown>, depth + 1, out)
      continue
    }

    out.push({ depth, key, value: formatValue(value) })
  }
}

function decodeDoc(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const doc = parsed as Record<string, unknown>
  const fields = doc.fields
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    const decoded = fromFirestoreFields(fields as Record<string, FirestoreValue>)
    for (const key of ['createTime', 'updateTime']) {
      if (typeof doc[key] === 'string') decoded[key] = new Date(doc[key] as string)
    }
    return decoded
  }

  const own: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(doc)) {
    if (key === 'fields' || key === 'name') continue
    own[key] = value
  }
  return own
}

function fieldsFor(raw: string | null): Field[] {
  const doc = decodeDoc(raw)
  if (!doc) return []
  const out: Field[] = []
  addFields(doc, 0, out)
  return out
}

function status(entry: TransferEntry) {
  if (entry.error) return 'ERR'
  return entry.status === null ? '...' : String(entry.status)
}

function timing(entry: TransferEntry) {
  return entry.endedAt === null ? '' : ` (${entry.endedAt - entry.startedAt}ms)`
}

function fieldLines(fields: Field[]) {
  return fields.map((field) => {
    const indent = `    ${'  '.repeat(field.depth)}`
    if (!field.value) return `${indent}${field.key}`
    const label = field.key.length >= KEY_COLUMN - 2 ? `${field.key}  ` : field.key.padEnd(KEY_COLUMN)
    return `${indent}${label}${field.value}`.trimEnd()
  })
}

function bodyText(entries: TransferEntry[]) {
  if (!entries.length) return 'waiting for requests\n'

  const lines: string[] = []
  for (const entry of entries) {
    lines.push(`${entry.method} ${entry.path} ${status(entry)}${timing(entry)}`.trimEnd())

    if (entry.requestBody) {
      lines.push('  request')
      lines.push(...fieldLines(fieldsFor(entry.requestBody)))
    }

    if (entry.endedAt !== null) {
      lines.push('  response')
      if (entry.error) {
        lines.push(`    ${entry.error}`)
      } else {
        const fields = fieldsFor(entry.responseBody)
        if (fields.length) lines.push(...fieldLines(fields))
        else {
          const raw = entry.responseBody && entry.responseBody.trim() ? entry.responseBody.trim().slice(0, 300) : '(empty)'
          lines.push(`    ${raw}`)
        }
      }
    }

    lines.push('')
  }

  const pending = entries.filter((entry) => entry.endedAt === null).length
  lines.push(
    pending
      ? `${pending} in flight`
      : `done · ${entries.length} request${entries.length === 1 ? '' : 's'}`,
  )

  return `${lines.join('\n')}\n`
}

function downloadLog(text: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `plutonium-firestore-${stamp}.log`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function TransferOverlay() {
  const [signedIn] = useState(() => currentSession() !== null)
  const [phase, setPhase] = useState<'live' | 'leaving' | 'gone'>('live')
  const entries = useSyncExternalStore(subscribeTransfers, getTransfers, getTransfers)
  const streamRef = useRef<HTMLPreElement>(null)
  const [typed, setTyped] = useState(0)
  const typedRef = useRef(0)

  const title = '$ Downloading User Data'
  const header = `${title}\n\n`
  const body = useMemo(() => bodyText(entries), [entries])
  const full = header + body

  const fullRef = useRef(full)
  fullRef.current = full

  useEffect(() => {
    if (phase === 'gone') return

    let frame = 0
    let last = 0

    const loop = (now: number) => {
      frame = window.requestAnimationFrame(loop)
      if (typedRef.current >= fullRef.current.length) return
      if (now - last < TYPE_INTERVAL_MS) return
      last = now
      setTyped((current) => {
        const target = fullRef.current.length
        const next =
          current >= target
            ? current
            : Math.min(target, current + Math.max(1, Math.round((target - current) / TYPE_CATCHUP_TICKS)))
        typedRef.current = next
        return next
      })
    }

    frame = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(frame)
  }, [phase])

  const pending = entries.filter((entry) => entry.endedAt === null).length
  const caughtUp = typed >= full.length
  const shown = full.slice(0, typed)
  const titleShown = title.slice(0, Math.min(shown.length, title.length))
  const bodyShown = shown.length > header.length ? shown.slice(header.length) : ''

  useEffect(() => {
    const stream = streamRef.current
    if (stream) stream.scrollTop = stream.scrollHeight
  }, [typed])

  useEffect(() => {
    if (phase === 'gone') return

    let recent = ''

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return
      recent = (recent + event.key).slice(-5)
      if (recent !== '12345') return
      recent = ''
      downloadLog(fullRef.current)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase])

  useEffect(() => {
    if (phase !== 'live' || pending || !caughtUp) return
    const timer = window.setTimeout(() => setPhase('leaving'), 900)
    return () => window.clearTimeout(timer)
  }, [phase, pending, caughtUp])

  useEffect(() => {
    if (phase !== 'leaving') return
    const timer = window.setTimeout(() => setPhase('gone'), 2150)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (!signedIn || phase === 'gone') return null

  return (
    <div
      className={`transfer-overlay${phase === 'leaving' ? ' transfer-overlay--leaving' : ''}`}
      role="region"
      aria-label="Downloading user data"
    >
      <div className="transfer-overlay__screen">
        <div className="transfer-overlay__panel">
          <p className="transfer-overlay__title">{titleShown}</p>
          <pre className="transfer-overlay__stream" ref={streamRef}>
            {bodyShown}
            <span className="transfer-overlay__caret" aria-hidden="true" />
          </pre>
        </div>
      </div>
    </div>
  )
}
