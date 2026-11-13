import { useEffect, useState } from 'react'
import AccountPanel from '@/components/account-panel'
import AddressBar from '@/components/address-bar/address-bar'
import ChromeTabs from '@/components/chrome-tabs/chrome-tabs'
import Clock from '@/components/clock/clock'
import DotBackgroundDemo from '@/components/dot-background-demo'
import HistoryPanel from '@/components/history-panel/history-panel'
import InfoPanel from '@/components/info-panel/info-panel'
import PageFrame from '@/components/page-frame/page-frame'
import PageView from '@/components/page-view/page-view'
import Pins from '@/components/pins/pins'
import ProxySwitcher from '@/components/proxy-switcher/proxy-switcher'
import QuickApps from '@/components/quick-apps/quick-apps'
import RegionMenu from '@/components/region-menu/region-menu'
import SearchBar from '@/components/search-bar/search-bar'
import SideMenu from '@/components/side-menu/side-menu'
import { useNet } from '@/hooks/use-net'
import { useTabs } from '@/hooks/use-tabs'
import { familyFor } from '@/lib/net/engines'
import { ensureConnected } from '@/lib/net/net-store'
import { isWebUrl } from '@/lib/net/url'
import { resolveUrl } from '@/lib/pluto-routes'
import './app-shell.css'

export default function App() {
  const { tabs, activeId, addTab, selectTab, closeTab, moveTab, navigate, back, forward } = useTabs()
  const net = useNet()
  const [panel, setPanel] = useState<'history' | 'info' | 'proxy' | 'region' | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [searchActive, setSearchActive] = useState(false)

  const activeTab = tabs.find((tab) => tab.id === activeId)
  const page = activeTab ? resolveUrl(activeTab.url) : null
  const onWeb = !!activeTab && isWebUrl(activeTab.url)
  const family = familyFor(net.engine)
  const home = !onWeb && !page

  // Readies the selected engine (relay race + service workers) once per engine.
  useEffect(() => {
    void ensureConnected()
  }, [net.engine])

  // Clicking the background, or Escape, dismisses an open panel. Captured so a
  // press anywhere inside the app counts, not just on elements that bubble.
  useEffect(() => {
    if (!panel) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (
        target.closest('.proxy-panel') ||
        target.closest('.history-panel') ||
        target.closest('.info-panel') ||
        target.closest('.region-menu') ||
        target.closest('.side-menu')
      )
        return
      setPanel(null)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPanel(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [panel])

  // A panel belongs to the screen it was opened on: switching tabs, navigating or
  // leaving the home screen closes it.
  useEffect(() => {
    setPanel(null)
  }, [activeId, activeTab?.url, home])

  // Switching engines repoints every frame, so a reload is implied.
  useEffect(() => {
    setReloadToken((token) => token + 1)
  }, [net.engine])

  return (
    <>
      <DotBackgroundDemo />
      <div className="app-shell">
        <div className="app-shell__tabs">
          <ChromeTabs
            tabs={tabs}
            activeId={activeId}
            onSelect={selectTab}
            onAdd={addTab}
            onClose={closeTab}
            onReorder={moveTab}
          />
        </div>

        {onWeb && activeTab && (
          <AddressBar
            url={activeTab.url}
            canBack={activeTab.index > 0}
            canForward={activeTab.index < activeTab.entries.length - 1}
            onBack={() => back(activeTab.id)}
            onForward={() => forward(activeTab.id)}
            onReload={() => setReloadToken((token) => token + 1)}
            onNavigate={(value) => {
              void navigate(value)
            }}
          />
        )}

        <div className="app-shell__stage">
          {/* Always mounted: Scramjet V2 binds to this iframe when it boots. */}
          <PageFrame
            tab={activeTab}
            visible={onWeb}
            engine={net.engine}
            region={family ? net.regions[family] : ''}
            reloadToken={reloadToken}
            status={net.status}
            error={net.error}
            latency={net.latency}
            onRetry={() => setReloadToken((token) => token + 1)}
          />
          {page && <PageView page={page} />}
        </div>
      </div>

      {home && (
        <>
          <SearchBar onNavigate={navigate} onActiveChange={setSearchActive} />
          <QuickApps onOpen={(href) => void navigate(href)} />
          <SideMenu activePanel={panel} onTogglePanel={(next) => setPanel(panel === next ? null : next)} />
          <Pins minimized={searchActive} onOpen={(href) => void navigate(href)} />
        </>
      )}

      {panel === 'proxy' && <ProxySwitcher />}
      {panel === 'region' && <RegionMenu />}
      {panel === 'info' && <InfoPanel onClose={() => setPanel(null)} />}
      {panel === 'history' && (
        <HistoryPanel
          onNavigate={(url) => {
            setPanel(null)
            void navigate(url)
          }}
        />
      )}

      {!onWeb && !page && <Clock />}
      <AccountPanel showTrigger={home} />
    </>
  )
}
