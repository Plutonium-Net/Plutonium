import { useState, useSyncExternalStore } from 'react'
import { currentSession } from '@/lib/cloud-store'
import { getTransfers, subscribeTransfers, type TransferEntry } from '@/lib/transfer-log'
import './transfer-overlay.css'

function pretty(raw: string | null) {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function timing(entry: TransferEntry) {
  if (entry.endedAt === null) return 'pending'
  return `${entry.endedAt - entry.startedAt}ms`
}

function statusLabel(entry: TransferEntry) {
  if (entry.error) return 'error'
  return entry.status === null ? '…' : String(entry.status)
}

export default function TransferOverlay() {
  const [signedIn] = useState(() => currentSession() !== null)
  const [dismissed, setDismissed] = useState(false)
  const entries = useSyncExternalStore(subscribeTransfers, getTransfers, getTransfers)

  if (!signedIn || dismissed) return null

  return (
    <div className="transfer-overlay" role="dialog" aria-modal="true" aria-label="Downloading user data">
      <div className="transfer-overlay__bar">
        <span className="transfer-overlay__title">Downloading User Data</span>
        <button type="button" className="transfer-overlay__close" onClick={() => setDismissed(true)}>
          Continue
        </button>
      </div>

      <div className="transfer-overlay__log">
        {entries.length === 0 ? (
          <p className="transfer-overlay__empty">Waiting for Firestore requests…</p>
        ) : (
          entries.map((entry) => (
            <article key={entry.id} className="transfer-overlay__entry">
              <header className="transfer-overlay__head">
                <span className="transfer-overlay__method">{entry.method}</span>
                <span className="transfer-overlay__path">{entry.path}</span>
                <span className="transfer-overlay__timing">
                  {statusLabel(entry)} · {timing(entry)}
                </span>
              </header>

              {entry.requestBody ? (
                <>
                  <span className="transfer-overlay__label">request</span>
                  <pre className="transfer-overlay__body">{pretty(entry.requestBody)}</pre>
                </>
              ) : null}

              {entry.endedAt !== null ? (
                <>
                  <span className="transfer-overlay__label">response</span>
                  <pre className="transfer-overlay__body">
                    {entry.error ?? (pretty(entry.responseBody) || '(empty)')}
                  </pre>
                </>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  )
}
