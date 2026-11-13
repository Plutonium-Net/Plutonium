import type { NetStatus as Status } from '@/lib/net/net-store'
import './net-status.css'

const LABELS: Record<Status, string> = {
  idle: 'idle',
  connecting: 'connecting',
  ok: 'connected',
  error: 'offline',
}

/**
 * The panel status readout: a link while the stack is up and a hazard triangle
 * when it is not. Same inline stroke icons the side menu uses, so it inherits
 * the icon weight from there instead of pulling in another icon set.
 */
export default function NetStatus({ status, latency }: { status: Status; latency: number | null }) {
  return (
    <span className={`net-status net-status--${status}`} role="status" aria-label={LABELS[status]} title={LABELS[status]}>
      <svg
        className="net-status__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {status === 'error' ? (
          <>
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </>
        ) : (
          <>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </>
        )}
      </svg>
      {latency ? <span className="net-status__ms">{Math.round(latency)}ms</span> : null}
    </span>
  )
}
