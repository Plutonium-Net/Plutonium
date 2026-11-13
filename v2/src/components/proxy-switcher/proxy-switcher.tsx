import GlassPanel from '@/components/glass-panel/glass-panel'
import NetStatus from '@/components/net-status/net-status'
import { useNet } from '@/hooks/use-net'
import { ENGINES } from '@/lib/net/engines'
import './proxy-switcher.css'

export default function ProxySwitcher() {
  const net = useNet()

  return (
    <GlassPanel className="proxy-panel">
      <div className="proxy-panel__head">
        <span className="proxy-panel__title">Proxy</span>
        <NetStatus status={net.status} latency={net.latency} />
      </div>

      <div className="proxy-panel__list">
        {ENGINES.map((engine) => (
          <button
            key={engine.id}
            type="button"
            className={`proxy-panel__row${engine.id === net.engine ? ' is-active' : ''}`}
            onClick={() => void net.setEngine(engine.id)}
          >
            <img className="proxy-panel__logo" src={engine.logo} alt="" draggable={false} />
            <span className="proxy-panel__copy">
              <span className="proxy-panel__name">{engine.label}</span>
              <span className="proxy-panel__hint">{engine.hint}</span>
            </span>
            {engine.id === net.engine && <span className="proxy-panel__check">●</span>}
          </button>
        ))}
      </div>

      {net.error && <div className="proxy-panel__error">{net.error}</div>}
    </GlassPanel>
  )
}
