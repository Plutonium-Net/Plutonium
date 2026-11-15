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

type NodeState = 'pending' | 'active' | 'done' | 'error'

/**
 * The loading screen over a proxied page.
 *
 * It blacks out the frame area - the proxied page, not the app chrome around it -
 * and reports the steps as a tree: every step is a dot on a curved branch, so the
 * shape of the tree says what has happened and where it stopped. The steps are
 * honest about what the app can actually observe: engine start, the region it
 * connects through, the request in flight, and then either the frame's load event
 * or the fact that nothing rendered.
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
  // itself, then the frame painting. Each branch is marked from that order.
  const engineState: NodeState =
    phase === 'starting' ? 'active' : phase === 'error' ? 'error' : 'done'
  const regionState: NodeState =
    phase === 'starting' || phase === 'error' ? 'pending' : 'done'
  const requestState: NodeState =
    phase === 'starting'
      ? 'pending'
      : phase === 'transferring'
        ? 'active'
        : phase === 'error'
          ? 'error'
          : 'done'
  const renderState: NodeState =
    phase === 'rendering' || phase === 'slow'
      ? 'active'
      : phase === 'blank'
        ? 'error'
        : phase === 'connected'
          ? 'done'
          : 'pending'

  const rootState: NodeState = failed ? 'error' : connected ? 'done' : 'active'

  const note =
    phase === 'slow'
      ? `${host} has not answered yet. Relays can be slow or blocked.`
      : phase === 'blank'
        ? 'The relay answered but the page came back empty.'
        : phase === 'error'
          ? (error ?? 'The proxy could not start.')
          : null

  const meta = connected ? 'Connected' : failed ? 'Stopped' : latency ? `${latency}ms ping` : 'working'

  const row = (state: NodeState, label: string, trailing?: string) => (
    <span className="page-loading__row">
      <span className="page-loading__dot" aria-hidden="true" />
      <span className="page-loading__label">{label}</span>
      {trailing ? <span className="page-loading__elapsed">{trailing}</span> : null}
    </span>
  )

  // Rendered inside .page-frame, which is the positioning box: the overlay is
  // exactly the proxied page, so the tabs, dock and margins around it stay usable.
  return (
    <div className={`page-loading page-loading--${phase}`} role="status" aria-live="polite">
      <div className="page-loading__panel">
        <ul className="page-loading__tree">
          <li data-state={rootState}>
            {row(rootState, title, `${(elapsed / 1000).toFixed(1)}s`)}
            <ul>
              <li data-state={engineState}>
                {row(engineState, engine)}
                <ul>
                  <li data-state={regionState}>{row(regionState, region)}</li>
                </ul>
              </li>
              <li data-state={requestState}>{row(requestState, host)}</li>
              <li data-state={renderState}>{row(renderState, 'frame')}</li>
            </ul>
          </li>
        </ul>

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
