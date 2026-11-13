import { useEffect } from 'react'
import { useNet } from '@/hooks/use-net'
import { ENGINES, familyFor } from '@/lib/net/engines'
import { serversFor } from '@/lib/net/regions'
import './proxy-switcher.css'

export default function ProxySwitcher() {
  const net = useNet()
  const family = familyFor(net.engine)
  const servers = family ? serversFor(family) : []
  const pings = family ? net.pings[family] : undefined

  // Opening the panel measures regions once, so the list can show latency.
  useEffect(() => {
    if (family && !pings) void net.probeRegions(family)
  }, [family, pings, net])

  return (
    <div className="proxy-panel">
      <div className="proxy-panel__head">
        <span className="proxy-panel__title">Proxy</span>
        <span className={`proxy-panel__status proxy-panel__status--${net.status}`}>
          {net.status === 'ok' ? 'connected' : net.status === 'connecting' ? 'connecting' : net.status === 'error' ? 'offline' : 'idle'}
          {net.latency ? ` · ${Math.round(net.latency)}ms` : ''}
        </span>
      </div>

      <div className="proxy-panel__list">
        {ENGINES.map((engine) => (
          <button
            key={engine.id}
            type="button"
            className={`proxy-panel__row${engine.id === net.engine ? ' is-active' : ''}`}
            onClick={() => void net.setEngine(engine.id)}
          >
            <span className="proxy-panel__copy">
              <span className="proxy-panel__name">{engine.label}</span>
              <span className="proxy-panel__hint">{engine.hint}</span>
            </span>
            {engine.id === net.engine && <span className="proxy-panel__check">●</span>}
          </button>
        ))}
      </div>

      {family && (
        <>
          <div className="proxy-panel__head proxy-panel__head--sub">
            <span className="proxy-panel__title">{family === 'wisp' ? 'Region' : 'Server'}</span>
          </div>
          <div className="proxy-panel__list">
            {servers.map((server) => {
              const ping = pings?.[server.id]
              const label = ping ? (ping.ok ? `${Math.round(ping.latency || 0)}ms` : 'offline') : '—'
              return (
                <button
                  key={server.id}
                  type="button"
                  className={`proxy-panel__row${server.id === net.regions[family] ? ' is-active' : ''}`}
                  onClick={() => void net.setRegion(family, server.id)}
                >
                  <span className="proxy-panel__copy">
                    <span className="proxy-panel__name">{server.label}</span>
                    <span className="proxy-panel__hint">{server.location}</span>
                  </span>
                  <span className={`proxy-panel__ping${ping && !ping.ok ? ' is-offline' : ''}`}>{label}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {net.error && <div className="proxy-panel__error">{net.error}</div>}
    </div>
  )
}
