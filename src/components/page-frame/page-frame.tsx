import { useEffect, useRef, useState } from 'react'
import PageLoading from '@/components/page-loading/page-loading'
import type { LoadPhase } from '@/components/page-loading/page-loading'
import type { Tab } from '@/hooks/use-tabs'
import { encodeUrl, engineLabel, familyFor, type EngineId } from '@/lib/net/engines'
import type { NetStatus } from '@/lib/net/net-store'
import { serversFor } from '@/lib/net/regions'
import './page-frame.css'

type PageFrameProps = {
  tab?: Tab
  visible: boolean
  engine: EngineId
  region: string
  customRelay?: string | null
  reloadToken: number
  status: NetStatus
  error: string | null
  latency: number | null
  onRetry: () => void
}

function relayLabel(relay: string) {
  try {
    return new URL(relay).hostname
  } catch {
    return relay
  }
}

const TRANSFERRING_AFTER = 800
const RENDERING_AFTER = 5000
const SLOW_AFTER = 14000
const CONNECTED_HOLD = 900

export default function PageFrame({
  tab,
  visible,
  engine,
  region,
  customRelay,
  reloadToken,
  status,
  error,
  latency,
  onRetry,
}: PageFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [phase, setPhase] = useState<LoadPhase>('idle')
  const [elapsed, setElapsed] = useState(0)

  const src = tab && visible ? (engine === 'remote' ? tab.frameUrl || tab.url : encodeUrl(engine, tab.url, region)) : 'about:blank'
  const family = familyFor(engine)
  const regionLabel =
    family === 'wisp' && customRelay
      ? relayLabel(customRelay)
      : family
        ? (serversFor(family).find((server) => server.id === region)?.label ?? region)
        : 'remote session'
  const target = (() => {
    try {
      return new URL(tab?.url || '').hostname.replace(/^www\./, '')
    } catch {
      return tab?.url || 'page'
    }
  })()

  useEffect(() => {
    if (visible && status === 'error') setPhase('error')
  }, [status, visible])

  useEffect(() => {
    if (!visible || !tab || src === 'about:blank' || status === 'error') {
      if (!visible) setPhase('idle')
      return
    }
    setPhase('starting')
    const timers = [
      window.setTimeout(() => setPhase((prev) => (prev === 'starting' ? 'transferring' : prev)), TRANSFERRING_AFTER),
      window.setTimeout(() => setPhase((prev) => (prev === 'transferring' ? 'rendering' : prev)), RENDERING_AFTER),
      window.setTimeout(
        () => setPhase((prev) => (prev === 'transferring' || prev === 'rendering' ? 'slow' : prev)),
        SLOW_AFTER,
      ),
    ]
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [src, visible, tab, status])

  const clocking = phase !== 'idle' && phase !== 'connected'
  useEffect(() => {
    if (!clocking) return
    const started = Date.now()
    setElapsed(0)
    const tick = window.setInterval(() => setElapsed(Date.now() - started), 100)
    return () => window.clearInterval(tick)
  }, [clocking, src])

  const lastReload = useRef(reloadToken)
  useEffect(() => {
    if (reloadToken === lastReload.current) return
    lastReload.current = reloadToken
    if (!visible) return
    const frame = frameRef.current
    if (!frame) return
    const current = frame.contentWindow?.location.href
    if (!current || current === 'about:blank') {
      frame.src = frame.src
      return
    }
    try {
      frame.contentWindow?.location.reload()
    } catch {
      frame.src = frame.src
    }
  }, [reloadToken, visible])

  function handleLoad() {
    const frame = frameRef.current
    if (!frame || !visible || src === 'about:blank') return

    let doc: Document | null = null
    try {
      doc = frame.contentDocument
    } catch {
      doc = null
    }

    const blank = !!doc && !(doc.body?.textContent || '').trim() && (doc.body?.childElementCount ?? 0) === 0

    setPhase(blank ? 'blank' : 'connected')
    if (!blank) window.setTimeout(() => setPhase((prev) => (prev === 'connected' ? 'idle' : prev)), CONNECTED_HOLD)
  }

  const showLoading = visible && clocking

  return (
    <div className={`page-frame${visible ? '' : ' is-hidden'}`}>
      <iframe
        ref={frameRef}
        id="page-frame"
        className="page-frame__frame"
        src={src}
        title={tab?.title || 'Page'}
        onLoad={handleLoad}
        allow="fullscreen; clipboard-read; clipboard-write; autoplay"
      />
      {showLoading && (
        <PageLoading
          phase={phase}
          engine={engineLabel(engine)}
          region={regionLabel}
          host={target}
          elapsed={elapsed}
          latency={latency}
          status={status}
          error={error}
          onRetry={onRetry}
        />
      )}
    </div>
  )
}
