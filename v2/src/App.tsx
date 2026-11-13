import { useEffect, useState } from 'react'
import AccountPanel from '@/components/account-panel'
import AddressBar from '@/components/address-bar/address-bar'
import ChromeTabs from '@/components/chrome-tabs/chrome-tabs'
import Clock from '@/components/clock/clock'
import DotBackgroundDemo from '@/components/dot-background-demo'
import HistoryPanel from '@/components/history-panel/history-panel'
import PageFrame from '@/components/page-frame/page-frame'
import PageView from '@/components/page-view/page-view'
import ProxySwitcher from '@/components/proxy-switcher/proxy-switcher'
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
  const [panel, setPanel] = useState<'history' | 'proxy' | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const activeTab = tabs.find((tab) => tab.id === activeId)
  const page = activeTab ? resolveUrl(activeTab.url) : null
  const onWeb = !!activeTab && isWebUrl(activeTab.url)
  const family = familyFor(net.engine)

  // Readies the selected engine (relay race + service workers) once per engine.
  useEffect(() => {
    void ensureConnected()
  }, [net.engine])

  // Switching engines repoints every frame, so a reload is implied.
  useEffect(() => {
    setReloadToken((token) => token + 1)
  }, [net.engine])

  const home = !onWeb && !page

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
          {onWeb && activeTab ? (
            <PageFrame
              tab={activeTab}
              engine={net.engine}
              region={family ? net.regions[family] : ''}
              reloadToken={reloadToken}
            />
          ) : page ? (
            <PageView title={page.title} />
          ) : null}
        </div>
      </div>

      {home && (
        <>
          <SearchBar onNavigate={navigate} />
          <SideMenu activePanel={panel} onTogglePanel={(next) => setPanel(panel === next ? null : next)} />
        </>
      )}

      {panel === 'proxy' && <ProxySwitcher />}
      {panel === 'history' && (
        <HistoryPanel
          onNavigate={(url) => {
            setPanel(null)
            void navigate(url)
          }}
        />
      )}

      {!onWeb && <Clock />}
      <AccountPanel />
    </>
  )
}
