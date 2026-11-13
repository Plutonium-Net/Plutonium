import GlassPanel from '@/components/glass-panel/glass-panel'
import { useHistory } from '@/hooks/use-history'
import { clearHistory, removeEntry } from '@/lib/history'
import './history-panel.css'

function when(ts: number) {
  const date = new Date(ts)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function HistoryPanel({ onNavigate }: { onNavigate: (url: string) => void }) {
  const entries = useHistory()

  return (
    <GlassPanel className="history-panel">
      <div className="history-panel__head">
        <span className="history-panel__title">History</span>
        {entries.length > 0 && (
          <button className="history-panel__clear" type="button" onClick={() => clearHistory()}>
            Clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="history-panel__empty">Nothing yet. Sign in to keep history across devices.</div>
      ) : (
        <div className="history-panel__list">
          {entries.map((entry) => (
            <div key={entry.id} className="history-panel__row">
              <button className="history-panel__open" type="button" onClick={() => onNavigate(entry.href)}>
                <span className="history-panel__name">{entry.title}</span>
                <span className="history-panel__meta">
                  {entry.href} · {when(entry.ts)}
                </span>
              </button>
              <button
                className="history-panel__remove"
                type="button"
                aria-label={`Remove ${entry.title}`}
                onClick={() => removeEntry(entry.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  )
}
