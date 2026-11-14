import { useEffect, useState } from 'react'
import AccountCenter from '@/components/account-center/account-center'
import AddressBar from '@/components/address-bar/address-bar'
import ChromeTabs from '@/components/chrome-tabs/chrome-tabs'
import Clock from '@/components/clock/clock'
import DesktopGate from '@/components/desktop-gate/desktop-gate'
import DotBackgroundDemo from '@/components/dot-background-demo'
import HistoryPanel from '@/components/history-panel/history-panel'
import FeedbackPanel from '@/components/feedback-panel/feedback-panel'
import GlowCursor from '@/components/glow-cursor/GlowCursor'
import InfoPanel from '@/components/info-panel/info-panel'
import LegalPanel from '@/components/legal-panel/legal-panel'
import OnlineCount from '@/components/online-count/online-count'
import type { LegalSection } from '@/lib/legal'
import PageFrame from '@/components/page-frame/page-frame'
import PageView from '@/components/page-view/page-view'
import Pins from '@/components/pins/pins'
import ProxySwitcher from '@/components/proxy-switcher/proxy-switcher'
import QuickApps from '@/components/quick-apps/quick-apps'
import RegionMenu from '@/components/region-menu/region-menu'
import SearchBar from '@/components/search-bar/search-bar'
import SideMenu from '@/components/side-menu/side-menu'
import SocialLinks from '@/components/social-links/social-links'
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
  const [dialog, setDialog] = useState<'feedback' | 'legal' | null>(null)
  const [legalSection, setLegalSection] = useState<LegalSection>('terms')
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
    if (!panel && !dialog) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (
        target.closest('.proxy-panel') ||
        target.closest('.history-panel') ||
        target.closest('.info-panel') ||
        target.closest('.region-menu') ||
        target.closest('.side-menu') ||
        target.closest('.glass-modal')
      )
        return
      setPanel(null)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      // The dialog sits above the panel, so it is dismissed first.
      if (dialog) {
        setDialog(null)
        return
      }
      setPanel(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [panel, dialog])

  // A panel belongs to the screen it was opened on: switching tabs, navigating or
  // leaving the home screen closes it. The search is treated the same way, or its
  // focus flag would survive the trip and come back with the pins still tucked
  // away and the page icons still hidden.
  useEffect(() => {
    setPanel(null)
    setSearchActive(false)
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
          {/* The light trail belongs to the home screen alone: it sits over the dot
              background and under the home UI, and listens on window, so it never
              takes a click from the search bar or the pins. */}
          <GlowCursor
            color="#5f8bff"
            intensity={1.3}
            trailWidth={3}
            linger={1.4}
            glow={1.2}
            clickBurst
            theme="dark"
            style={{ position: 'fixed', inset: 0, zIndex: 4, pointerEvents: 'none' }}
          />
          <SearchBar onNavigate={navigate} onActiveChange={setSearchActive} />
          <OnlineCount hidden={searchActive} />
          <QuickApps hidden={searchActive} onOpen={(href) => void navigate(href)} />
          <SideMenu activePanel={panel} onTogglePanel={(next) => setPanel(panel === next ? null : next)} />
          <Pins minimized={searchActive} onOpen={(href) => void navigate(href)} />
          <SocialLinks />
        </>
      )}

      {panel === 'proxy' && <ProxySwitcher />}
      {panel === 'region' && <RegionMenu />}
      {panel === 'info' && (
        <InfoPanel
          onClose={() => setPanel(null)}
          onOpenFeedback={() => setDialog('feedback')}
          onOpenLegal={(section) => {
            setLegalSection(section)
            setDialog('legal')
          }}
        />
      )}
      {panel === 'history' && (
        <HistoryPanel
          onNavigate={(url) => {
            setPanel(null)
            void navigate(url)
          }}
        />
      )}

      {dialog === 'feedback' && (
        <FeedbackPanel
          onClose={() => setDialog(null)}
          onOpenPrivacy={() => {
            setLegalSection('privacy')
            setDialog('legal')
          }}
        />
      )}
      {dialog === 'legal' && (
        <LegalPanel section={legalSection} onSectionChange={setLegalSection} onClose={() => setDialog(null)} />
      )}

      {!onWeb && !page && <Clock />}
      <AccountCenter showTrigger={home} />
      <DesktopGate />
    </>
  )
}
