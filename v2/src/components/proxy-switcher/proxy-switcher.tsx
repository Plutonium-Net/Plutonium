import { useEffect } from 'react'
import GlassHighlight from '@/components/glass-highlight/glass-highlight'
import GlassPanel from '@/components/glass-panel/glass-panel'
import { HazardIcon, PlugIcon } from '@/components/net-icons/net-icons'
import NetStatus from '@/components/net-status/net-status'
import { useNet } from '@/hooks/use-net'
import { ENGINES, type EngineOption } from '@/lib/net/engines'
import { probeRegions } from '@/lib/net/net-store'
import './proxy-switcher.css'

export default function ProxySwitcher() {
  const net = useNet()

  // An engine that rides a region family is only usable while that family has a
  // server answering, so the menu measures all three families once on open.
  useEffect(() => {
    if (!net.pings.wisp) void probeRegions('wisp')
    if (!net.pings.compaxy) void probeRegions('compaxy')
    if (!net.pings.rh) void probeRegions('rh')
  }, [net.pings])

  /** null while the family has not been measured yet. */
  function availability(engine: EngineOption): boolean | null {
    if (!engine.family) return true
    const measured = net.pings[engine.family]
    if (!measured) return null
    return Object.values(measured).some((ping) => ping.ok)
  }

  return (
    <GlassPanel className="proxy-panel">
      <div className="proxy-panel__head">
        <span className="proxy-panel__title">Proxy</span>
        <NetStatus status={net.status} latency={net.latency} />
      </div>

      <div className="proxy-panel__list">
        {ENGINES.map((engine) => {
          const available = availability(engine)
          const down = available === false
          const active = engine.id === net.engine
          return (
            <button
              key={engine.id}
              type="button"
              className={`proxy-panel__row${active ? ' is-active' : ''}${down ? ' is-offline' : ''}`}
              disabled={down}
              title={down ? `${engine.label} has no reachable server` : undefined}
              onClick={() => {
                if (down) return
                void net.setEngine(engine.id)
              }}
            >
              {active && <GlassHighlight />}
              <img className="proxy-panel__logo" src={engine.logo} alt="" draggable={false} />
              <span className="proxy-panel__copy">
                <span className="proxy-panel__name">{engine.label}</span>
                <span className="proxy-panel__hint">{engine.hint}</span>
              </span>
              {down ? <HazardIcon /> : available ? <PlugIcon /> : null}
            </button>
          )
        })}
      </div>

      {net.error && <div className="proxy-panel__error">{net.error}</div>}
    </GlassPanel>
  )
}
