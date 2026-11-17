import { useEffect, useState, type FormEvent } from 'react'
import GlassHighlight from '@/components/glass-highlight/glass-highlight'
import GlassPanel from '@/components/glass-panel/glass-panel'
import { HazardIcon, PlugIcon } from '@/components/net-icons/net-icons'
import NetStatus from '@/components/net-status/net-status'
import { useNet } from '@/hooks/use-net'
import { familyFor } from '@/lib/net/engines'
import { probeCustomWisp, probeRegions } from '@/lib/net/net-store'
import { normalizeWispUrl, serversFor } from '@/lib/net/regions'
import './region-menu.css'

export default function RegionMenu() {
  const net = useNet()
  const family = familyFor(net.engine)
  const servers = family ? serversFor(family) : []
  const pings = family ? net.pings[family] : undefined
  const customPing = net.pings.wisp?.custom
  const [draft, setDraft] = useState(net.customWisp ?? '')
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (family && !pings) void probeRegions(family)
  }, [family, pings])

  useEffect(() => {
    setDraft(net.customWisp ?? '')
  }, [net.customWisp])

  useEffect(() => {
    if (family === 'wisp' && net.customWisp) void probeCustomWisp()
  }, [family, net.customWisp])

  function applyCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const url = normalizeWispUrl(draft)
    if (!url) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDraft(url)
    void net.setCustomWisp(url)
  }

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
                    <span className="region-menu__ms">-</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="region-menu__empty">Hyperbeam runs its own session, so there is no region to pick.</div>
      )}

      {family === 'wisp' && (
        <form className="region-menu__custom" onSubmit={applyCustom}>
          <span className="region-menu__custom-label">Custom Wisp server</span>
          <div className="region-menu__field">
            <input
              className="region-menu__input"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="wss://wisp.example.com/"
              aria-label="Custom Wisp server URL"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                setInvalid(false)
              }}
            />
            <button className="region-menu__apply" type="submit" disabled={!draft.trim()}>
              {net.useCustom ? 'Update' : 'Use'}
            </button>
          </div>

          {invalid ? (
            <div className="region-menu__notice is-error">Enter a ws:// or wss:// URL</div>
          ) : net.customWisp ? (
            <div className="region-menu__notice">
              {net.useCustom ? (
                <>
                  <PlugIcon className="region-menu__plug" />
                  <span>{customPing?.ok ? `${Math.round(customPing.latency || 0)}ms` : 'custom relay'}</span>
                  <button
                    type="button"
                    className="region-menu__clear"
                    onClick={() => {
                      setDraft('')
                      void net.setCustomWisp(null)
                    }}
                  >
                    Reset
                  </button>
                </>
              ) : (
                <>
                  <span>Saved</span>
                  <button type="button" className="region-menu__clear" onClick={() => void net.setCustomWisp(net.customWisp)}>
                    Use it
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="region-menu__notice">Saved to your account and used by every Wisp proxy.</div>
          )}
        </form>
      )}
    </GlassPanel>
  )
}
