import { useEffect } from 'react'
import GlassHighlight from '@/components/glass-highlight/glass-highlight'
import GlassPanel from '@/components/glass-panel/glass-panel'
import { HazardIcon, PlugIcon } from '@/components/net-icons/net-icons'
import NetStatus from '@/components/net-status/net-status'
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
    <GlassPanel className="region-menu">
      <div className="region-menu__head">
        <span className="region-menu__title">{family === 'wisp' ? 'Region' : 'Server'}</span>
        <NetStatus status={net.status} latency={net.latency} />
      </div>

      {family ? (
        <div className="region-menu__list">
          {servers.map((server) => {
            const ping = pings?.[server.id]
            // A dead relay cannot be connected to, so its row does not select.
            const offline = !!ping && !ping.ok
            const active = server.id === net.regions[family]
            return (
              <button
                key={server.id}
                type="button"
                className={`region-menu__row${active ? ' is-active' : ''}${offline ? ' is-offline' : ''}`}
                disabled={offline}
                title={offline ? `${server.label} is offline` : undefined}
                onClick={() => {
                  if (offline) return
                  void net.setRegion(family, server.id)
                }}
              >
                {active && <GlassHighlight />}
                <img className="region-menu__flag" src={server.flag} alt="" draggable={false} />
                <span className="region-menu__copy">
                  <span className="region-menu__name">{server.label}</span>
                  <span className="region-menu__hint">{server.location}</span>
                </span>
                <span className="region-menu__ping">
                  {offline ? (
                    <HazardIcon className="region-menu__error-icon" />
                  ) : ping ? (
                    <>
                      <PlugIcon className="region-menu__plug" />
                      <span className="region-menu__ms">{Math.round(ping.latency || 0)}ms</span>
                    </>
                  ) : (
                    <span className="region-menu__ms">—</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="region-menu__empty">Hyperbeam runs its own session, so there is no region to pick.</div>
      )}
    </GlassPanel>
  )
}
