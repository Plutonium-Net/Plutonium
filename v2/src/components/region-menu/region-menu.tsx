import { useEffect } from 'react'
import { useNet } from '@/hooks/use-net'
import { familyFor } from '@/lib/net/engines'
import { probeRegions } from '@/lib/net/net-store'
import { serversFor } from '@/lib/net/regions'
import './region-menu.css'

/**
 * The globe menu: a region picker of its own, so the proxy switcher only lists
 * engines. Whichever family the current engine belongs to decides whether these
 * rows are wisp relays, Compaxy hosts or RH hosts.
 */
export default function RegionMenu() {
  const net = useNet()
  const family = familyFor(net.engine)
  const servers = family ? serversFor(family) : []
  const pings = family ? net.pings[family] : undefined

  // Opening the menu measures the regions once, so the list can show latency.
  useEffect(() => {
    if (family && !pings) void probeRegions(family)
  }, [family, pings])

  return (
    <div className="region-menu">
      <div className="region-menu__head">
        <span className="region-menu__title">{family === 'wisp' ? 'Region' : 'Server'}</span>
        <span className={`region-menu__status region-menu__status--${net.status}`}>
          {net.status === 'ok' ? 'connected' : net.status === 'connecting' ? 'connecting' : net.status === 'error' ? 'offline' : 'idle'}
          {net.latency ? ` · ${Math.round(net.latency)}ms` : ''}
        </span>
      </div>

      {family ? (
        <div className="region-menu__list">
          {servers.map((server) => {
            const ping = pings?.[server.id]
            const label = ping ? (ping.ok ? `${Math.round(ping.latency || 0)}ms` : 'offline') : '—'
            return (
              <button
                key={server.id}
                type="button"
                className={`region-menu__row${server.id === net.regions[family] ? ' is-active' : ''}`}
                onClick={() => void net.setRegion(family, server.id)}
              >
                <img className="region-menu__flag" src={server.flag} alt="" draggable={false} />
                <span className="region-menu__copy">
                  <span className="region-menu__name">{server.label}</span>
                  <span className="region-menu__hint">{server.location}</span>
                </span>
                <span className={`region-menu__ping${ping && !ping.ok ? ' is-offline' : ''}`}>{label}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="region-menu__empty">Hyperbeam runs its own session, so there is no region to pick.</div>
      )}
    </div>
  )
}
