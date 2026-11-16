import { HazardIcon, LinkIcon } from '@/components/net-icons/net-icons'
import type { NetStatus as Status } from '@/lib/net/net-store'
import './net-status.css'

const LABELS: Record<Status, string> = {
  idle: 'idle',
  connecting: 'connecting',
  ok: 'connected',
  error: 'offline',
}

export default function NetStatus({ status, latency }: { status: Status; latency: number | null }) {
  return (
    <span className={`net-status net-status--${status}`} role="status" aria-label={LABELS[status]} title={LABELS[status]}>
      {status === 'error' ? <HazardIcon className="net-status__icon" /> : <LinkIcon className="net-status__icon" />}
      {latency ? <span className="net-status__ms">{Math.round(latency)}ms</span> : null}
    </span>
  )
}
