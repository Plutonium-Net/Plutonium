import GlassSurface from '@/components/glass-surface/GlassSurface'
import type { NetStatus } from '@/lib/net/net-store'
import './page-loading.css'

export type LoadPhase = 'idle' | 'starting' | 'transferring' | 'rendering' | 'slow' | 'connected' | 'blank' | 'error'

type Props = {
  phase: LoadPhase
  engine: string
  region: string
  host: string
  elapsed: number
  latency: number | null
  status: NetStatus
  error: string | null
  onRetry: () => void
}

/**
 * The loading screen over a proxied page. The steps are honest about what the app
 * can actually observe: engine start, relay connect, the request in flight, and
 * then either the frame's load event or the fact that nothing rendered.
 */
export default function PageLoading({ phase, engine, region, host, elapsed, latency, status, error, onRetry }: Props) {
  const title =
    phase === 'starting'
      ? 'Starting the proxy'
      : phase === 'transferring'
        ? 'Transferring'
        : phase === 'rendering'
          ? 'Rendering page'
          : phase === 'slow'
            ? 'Still working'
            : phase === 'connected'
              ? 'Connected'
              : phase === 'blank'
                ? 'Nothing rendered'
                : 'Could not load'

  const detail =
    phase === 'starting'
      ? status === 'connecting'
        ? `Warming up ${engine}…`
        : `Preparing ${engine}…`
      : phase === 'transferring'
        ? `${host} · ${region}`
        : phase === 'rendering'
          ? `Waiting on ${host} · ${region}`
          : phase === 'slow'
            ? `${host} has not answered yet. Relays can be slow or blocked.`
            : phase === 'connected'
              ? `${host} is open`
              : phase === 'blank'
                ? 'The relay answered but the page came back empty.'
                : (error ?? 'The proxy could not start.')

  const failed = phase === 'error' || phase === 'blank'
  const busy = !failed && phase !== 'connected'

  return (
    <div className={`page-loading page-loading--${phase}`} role="status" aria-live="polite">
      <div className="page-loading__card">
        <GlassSurface
          className="page-loading__glass"
          width="100%"
          height="100%"
          borderRadius={16}
          backgroundOpacity={0.12}
          saturation={1.25}
          displace={0.5}
        />
        <div className="page-loading__body">
          <div className="page-loading__head">
            <span className={`page-loading__dot${failed ? ' is-failed' : ''}`} aria-hidden="true" />
            <span className="page-loading__title">{title}</span>
            <span className="page-loading__elapsed">{(elapsed / 1000).toFixed(1)}s</span>
          </div>

          <p className="page-loading__detail">{detail}</p>

          <div className={`page-loading__bar${failed ? ' is-failed' : ''}`} aria-hidden="true">
            {busy ? <span className="page-loading__bar-fill" /> : null}
          </div>

          <div className="page-loading__foot">
            <span className="page-loading__meta">
              {phase === 'connected' ? 'Connected' : failed ? 'Stopped' : latency ? `${latency}ms ping` : 'working'}
            </span>
            {phase !== 'connected' ? (
              <button type="button" className="page-loading__retry" onClick={onRetry}>
                {failed ? 'Try again' : 'Reload'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
