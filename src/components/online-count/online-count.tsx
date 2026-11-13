import { useEffect, useState } from 'react'
import './online-count.css'

/**
 * The v1 users-online readout, ported from js/online-count.js: the same public
 * endpoint, the same 30s poll (paused while the tab is hidden) and the same
 * "—" when the service does not answer.
 */

const ENDPOINT = 'https://stelena.plutoniumnet.work/online'
const POLL_MS = 30_000

function parseCount(data: unknown): number | null {
  if (typeof data === 'number') return data
  if (data && typeof data === 'object') {
    const record = data as { online?: unknown; count?: unknown; users?: unknown }
    for (const value of [record.online, record.count, record.users]) {
      if (typeof value === 'number') return value
    }
  }
  return null
}

export default function OnlineCount({ hidden = false }: { hidden?: boolean }) {
  const [count, setCount] = useState<number | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let alive = true

    async function refresh() {
      try {
        const response = await fetch(ENDPOINT, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const total = parseCount(await response.json())
        if (!alive) return
        setCount(total)
        setOffline(total === null)
      } catch {
        if (!alive) return
        setCount(null)
        setOffline(true)
      }
    }

    void refresh()
    const timer = window.setInterval(() => {
      if (document.hidden) return
      void refresh()
    }, POLL_MS)

    function onVisibilityChange() {
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return (
    <div
      className={`online-count${hidden ? ' is-hidden' : ''}${offline ? ' is-offline' : ''}`}
      aria-hidden={hidden || undefined}
    >
      <span className="online-count__dot" aria-hidden="true" />
      <span className="online-count__label">Users Online:</span>
      <span className="online-count__value">{count === null ? '—' : count.toLocaleString('en-US')}</span>
    </div>
  )
}
