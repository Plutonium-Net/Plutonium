import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { currentSession, fromFirestoreFields, type FirestoreValue } from '@/lib/cloud-store'
import { getTransfers, subscribeTransfers, type TransferEntry } from '@/lib/transfer-log'
import './transfer-overlay.css'

const MAX_VALUE = 120
const MAX_STAGGER = 8

type Row = readonly [string, string]

function short(value: unknown): string {
  let text: string
  if (typeof value === 'string') text = `"${value}"`
  else if (value === null || value === undefined) text = 'null'
  else if (typeof value === 'number' || typeof value === 'boolean') text = String(value)
  else if (value instanceof Date) text = value.toISOString()
  else {
    try {
      text = JSON.stringify(value) ?? 'null'
    } catch {
      text = String(value)
    }
  }
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text
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

function rowsFor(raw: string | null): Row[] {
  const doc = decodeDoc(raw)
  if (!doc) return []
  return Object.entries(doc).map(([key, value]) => [key, short(value)] as Row)
}

function status(entry: TransferEntry) {
  if (entry.error) return 'ERR'
  return entry.status === null ? '...' : String(entry.status)
}

function timing(entry: TransferEntry) {
  return entry.endedAt === null ? '' : ` (${entry.endedAt - entry.startedAt}ms)`
}

function reveal(index: number) {
  return { '--i': Math.min(index, MAX_STAGGER) } as CSSProperties
}

function BodyBlock({
  label,
  raw,
  rows,
  error,
  start,
}: {
  label: string
  raw: string | null
  rows: Row[]
  error?: string | null
  start: number
}) {
  return (
    <>
      <p className="transfer-overlay__tag transfer-overlay__reveal" style={reveal(start)}>
        {label}
      </p>
      {error ? (
        <p className="transfer-overlay__text transfer-overlay__reveal" style={reveal(start + 1)}>
          {error}
        </p>
      ) : rows.length ? (
        <dl className="transfer-overlay__fields">
          {rows.map(([key, value], index) => (
            <div
              className="transfer-overlay__field transfer-overlay__reveal"
              style={reveal(start + 1 + index)}
              key={key}
            >
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="transfer-overlay__text transfer-overlay__reveal" style={reveal(start + 1)}>
          {raw && raw.trim() ? raw.trim().slice(0, 300) : '(empty)'}
        </p>
      )}
    </>
  )
}

export default function TransferOverlay() {
  const [signedIn] = useState(() => currentSession() !== null)
  const [phase, setPhase] = useState<'live' | 'leaving' | 'gone'>('live')
  const entries = useSyncExternalStore(subscribeTransfers, getTransfers, getTransfers)
  const logRef = useRef<HTMLDivElement>(null)

  const pending = entries.filter((entry) => entry.endedAt === null).length
  const complete = pending === 0

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [entries])

  useEffect(() => {
    if (phase !== 'live' || !complete) return
    const timer = window.setTimeout(() => setPhase('leaving'), entries.length ? 1850 : 6000)
    return () => window.clearTimeout(timer)
  }, [phase, complete, entries.length])

  useEffect(() => {
    if (phase !== 'leaving') return
    const timer = window.setTimeout(() => setPhase('gone'), 2150)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (!signedIn || phase === 'gone') return null

  const summary = !entries.length
    ? 'waiting for requests'
    : pending
      ? `${pending} in flight`
      : `done · ${entries.length} request${entries.length === 1 ? '' : 's'}`

  return (
    <div
      className={`transfer-overlay${phase === 'leaving' ? ' transfer-overlay--leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Downloading user data"
    >
      <div className="transfer-overlay__screen">
        <div className="transfer-overlay__panel">
          <p className="transfer-overlay__cmd transfer-overlay__reveal" style={reveal(0)}>
            <span className="transfer-overlay__prompt">$</span> Downloading User Data
          </p>
          <p className="transfer-overlay__meta transfer-overlay__reveal" style={reveal(1)}>
            {summary}
          </p>

          <div className="transfer-overlay__log" ref={logRef}>
            {entries.map((entry) => {
              const requestRows = entry.requestBody ? rowsFor(entry.requestBody) : []
              const requestSpan = entry.requestBody ? 1 + Math.max(requestRows.length, 1) : 0

              return (
                <article key={entry.id} className="transfer-overlay__entry">
                  <p className="transfer-overlay__line transfer-overlay__reveal" style={reveal(0)}>
                    {entry.method} {entry.path}
                    <span className="transfer-overlay__status">
                      {' '}
                      {status(entry)}
                      {timing(entry)}
                    </span>
                  </p>

                  {entry.requestBody ? (
                    <BodyBlock label="request" raw={entry.requestBody} rows={requestRows} start={1} />
                  ) : null}

                  {entry.endedAt !== null ? (
                    <BodyBlock
                      label="response"
                      raw={entry.responseBody}
                      rows={rowsFor(entry.responseBody)}
                      error={entry.error}
                      start={1 + requestSpan}
                    />
                  ) : null}
                </article>
              )
            })}
            <span className="transfer-overlay__caret" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  )
}
