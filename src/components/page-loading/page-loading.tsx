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

type StepState = 'pending' | 'active' | 'done' | 'error'

function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.4 6.3 4.8 8.7 9.6 3.9" />
    </svg>
  )
}

function CrossMark() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M3.2 3.2 8.8 8.8M8.8 3.2 3.2 8.8" />
    </svg>
  )
}

/**
 * The loading screen over a proxied page.
 *
 * It blacks out the frame area - the proxied page, not the app chrome around it -
 * and reports the startup as a checklist that builds itself: each finished step
 * runs a line down to the next box, which is how the work actually happens. The
 * steps are honest about what the app can observe: engine start, the relay region,
 * the request in flight, and then either the frame's load event or nothing.
 */
export default function PageLoading({ phase, engine, region, host, elapsed, latency, status, error, onRetry }: Props) {
  const failed = phase === 'error' || phase === 'blank'
  const connected = phase === 'connected'

  const title =
    phase === 'starting'
      ? status === 'connecting'
        ? 'Connecting'
        : 'Starting the proxy'
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
                : failed
                  ? 'Could not load'
                  : 'Connecting'

  // The engine comes up first, then the relay region it picked, then the request
  // itself, then the frame painting. Each box is filled from that order.
  const steps: { key: string; label: string; desc: string; state: StepState }[] = [
    {
      key: 'engine',
      label: 'Starting the proxy',
      desc: engine,
      state: phase === 'starting' ? 'active' : phase === 'error' ? 'error' : 'done',
    },
    {
      key: 'region',
      label: 'Connecting the relay',
      desc: region,
      state: phase === 'starting' || phase === 'error' ? 'pending' : 'done',
    },
    {
      key: 'request',
      label: 'Transferring the page',
      desc: host,
      state:
        phase === 'starting'
          ? 'pending'
          : phase === 'transferring'
            ? 'active'
            : phase === 'error'
              ? 'pending'
              : 'done',
    },
    {
      key: 'render',
      label: 'Rendering the frame',
      desc: 'first paint',
      state:
        phase === 'rendering' || phase === 'slow'
          ? 'active'
          : phase === 'blank'
            ? 'error'
            : phase === 'connected'
              ? 'done'
              : 'pending',
    },
  ]

  const note =
    phase === 'slow'
      ? `${host} has not answered yet. Relays can be slow or blocked.`
      : phase === 'blank'
        ? 'The relay answered but the page came back empty.'
        : phase === 'error'
          ? (error ?? 'The proxy could not start.')
          : null

  const meta = connected ? 'Connected' : failed ? 'Stopped' : latency ? `${latency}ms ping` : 'working'

  // Rendered inside .page-frame, which is the positioning box: the overlay is
  // exactly the proxied page, so the tabs, dock and margins around it stay usable.
  return (
    <div className={`page-loading page-loading--${phase}`} role="status" aria-live="polite">
      <div className="page-loading__panel">
        <div className="page-loading__head">
          <span className="page-loading__title">{title}</span>
          <span className="page-loading__elapsed">{(elapsed / 1000).toFixed(1)}s</span>
        </div>

        <ol className="page-loading__steps">
          {steps.map((step) => (
            <li key={step.key} data-state={step.state}>
              <span className="page-loading__check" aria-hidden="true">
                {step.state === 'done' ? <CheckMark /> : step.state === 'error' ? <CrossMark /> : null}
              </span>
              <span className="page-loading__body">
                <span className="page-loading__label">{step.label}</span>
                <span className="page-loading__desc">{step.desc}</span>
              </span>
            </li>
          ))}
        </ol>

        {note ? <p className="page-loading__note">{note}</p> : null}

        <div className="page-loading__foot">
          <span className="page-loading__meta">{meta}</span>
          {connected ? null : (
            <button type="button" className="page-loading__retry" onClick={onRetry}>
              {failed ? 'Try again' : 'Reload'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
