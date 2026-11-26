import { useCallback, useEffect, useRef, useState } from 'react'
import AccountCenter from '@/components/account-center/account-center'
import AddressBar from '@/components/address-bar/address-bar'
import Background from '@/components/backgrounds/backgrounds'
import ChromeTabs from '@/components/chrome-tabs/chrome-tabs'
import ClipButton, { useClipAvailability } from '@/components/clip-button/clip-button'
import ClipToaster from '@/components/clip-button/clip-toaster'
import Clock from '@/components/clock/clock'
import CustomizePanel from '@/components/customize-panel/customize-panel'
import DesktopGate from '@/components/desktop-gate/desktop-gate'
import DistortionWave from '@/components/distortion-wave/distortion-wave'
import type { WaveOrigin, WavePhase } from '@/components/distortion-wave/distortion-wave'
import HistoryPanel from '@/components/history-panel/history-panel'
import FeedbackPanel from '@/components/feedback-panel/feedback-panel'
import GlowCursor from '@/components/glow-cursor/GlowCursor'
import GradualBlur from '@/components/gradual-blur/gradual-blur'
import InfoPanel from '@/components/info-panel/info-panel'
import LegalPanel from '@/components/legal-panel/legal-panel'
import OnlineCount from '@/components/online-count/online-count'
import type { LegalSection } from '@/lib/legal'
import PageFrame from '@/components/page-frame/page-frame'
import PageView from '@/components/page-view/page-view'
import PerformancePanel from '@/components/performance-panel/performance-panel'
import Pins from '@/components/pins/pins'
import ProxySwitcher from '@/components/proxy-switcher/proxy-switcher'
import QuickApps from '@/components/quick-apps/quick-apps'
import RegionMenu from '@/components/region-menu/region-menu'
import SearchBar from '@/components/search-bar/search-bar'
import SideMenu from '@/components/side-menu/side-menu'
import SidePanelHost from '@/components/side-panel-host/side-panel-host'
import SocialLinks from '@/components/social-links/social-links'
import TransferOverlay from '@/components/transfer-overlay/transfer-overlay'
import { useAccent } from '@/hooks/use-accent'
import { useNet } from '@/hooks/use-net'
import { usePerformance } from '@/hooks/use-performance'
import { useTabs } from '@/hooks/use-tabs'
import { familyFor } from '@/lib/net/engines'
import { ensureConnected } from '@/lib/net/net-store'
import { isWebUrl } from '@/lib/net/url'
import { resolveUrl } from '@/lib/pluto-routes'
import './app-shell.css'

export default function App() {
  const { tabs, activeId, addTab, selectTab, closeTab, moveTab, navigate, back, forward } = useTabs()
  const net = useNet()
  const accent = useAccent()
  const performance = usePerformance()
  const glowCursorOff = performance.enabled && performance.features.glowCursor
  const topBlurOff = performance.enabled && performance.features.topBlur
  const [panel, setPanel] = useState<'history' | 'info' | 'proxy' | 'region' | 'customize' | 'performance' | null>(
    null,
  )
  const [dialog, setDialog] = useState<'feedback' | 'legal' | null>(null)
  const [legalSection, setLegalSection] = useState<LegalSection>('terms')
  const [reloadToken, setReloadToken] = useState(0)
  const [searchActive, setSearchActive] = useState(false)
  const [wave, setWave] = useState<{ origin: WaveOrigin; phase: WavePhase } | null>(null)
  const waveJob = useRef<{ input: string; resolve: (accepted: boolean) => void; accepted: boolean } | null>(null)

  const searchWithWave = useCallback(
    (input: string, origin?: DOMRect) =>
      new Promise<boolean>((resolve) => {
        const source: WaveOrigin = origin
          ? { x: origin.left, y: origin.top, width: origin.width, height: origin.height }
          : { x: window.innerWidth / 2 - 260, y: window.innerHeight / 2 - 24, width: 520, height: 48 }
        waveJob.current?.resolve(false)
        waveJob.current = { input, resolve, accepted: false }
        setWave({ origin: source, phase: 'cover' })
      }),
    [],
  )

  const onWaveCovered = useCallback(() => {
    const job = waveJob.current
    if (!job) return
    void navigate(job.input)
      .catch(() => false)
      .then((accepted) => {
        job.accepted = accepted
        setWave((current) => (current ? { ...current, phase: 'reveal' } : current))
      })
  }, [navigate])

  const onWaveFinished = useCallback(() => {
    const job = waveJob.current
    waveJob.current = null
    setWave(null)
    job?.resolve(job.accepted)
  }, [])

  useEffect(() => {
    function onNavigate(event: Event) {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string' && detail) void navigate(detail)
    }
    window.addEventListener('plu:navigate', onNavigate)
    return () => window.removeEventListener('plu:navigate', onNavigate)
  }, [navigate])

  const activeTab = tabs.find((tab) => tab.id === activeId)
  const page = activeTab ? resolveUrl(activeTab.url) : null
  const onWeb = !!activeTab && isWebUrl(activeTab.url)
  const clipReady = useClipAvailability() === 'ready'
  const family = familyFor(net.engine)
  const home = !onWeb && !page

  useEffect(() => {
    void ensureConnected()
  }, [net.engine])

  useEffect(() => {
    if (!panel && !dialog) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (
        target.closest('.proxy-panel') ||
        target.closest('.history-panel') ||
        target.closest('.customize-panel') ||
        target.closest('.performance-panel') ||
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

  useEffect(() => {
    setPanel(null)
    setSearchActive(false)
  }, [activeId, activeTab?.url, home])

  useEffect(() => {
    setReloadToken((token) => token + 1)
  }, [net.engine])

  return (
    <>
      <Background />
      <div className="app-shell">
        <div className="app-shell__tabs">
          <ChromeTabs
            tabs={tabs}
            activeId={activeId}
            onSelect={selectTab}
            onAdd={addTab}
            onClose={closeTab}
            onReorder={moveTab}
            addCentered={home}
            trailing={
              onWeb && clipReady ? (
                <ClipButton
                  variant="pill"
                  target={() => document.getElementById('page-frame')}
                  label={() => activeTab?.title || 'Proxied page'}
                  source="tab"
                />
              ) : null
            }
          />
          {!topBlurOff && (
            <div className="app-shell__tabs-blur">
              {/* Ramp hugs the top of the viewport and eases downward behind the tab bar. */}
              <GradualBlur
                position="top"
                height="6rem"
                strength={3}
                layers={10}
                curve="linear"
                exponential
                tint="transparent"
                hoverIntensity={1}
                autoHide={false}
              />
            </div>
          )}
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
          <PageFrame
            tab={activeTab}
            visible={onWeb}
            engine={net.engine}
            region={family ? net.regions[family] : ''}
            customRelay={family === 'wisp' && net.useCustom ? net.customWisp : null}
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
          {!glowCursorOff && (
            <GlowCursor
              color={accent.hex}
            intensity={1.3}
            trailWidth={3}
            linger={1.4}
            glow={1.2}
            clickBurst
            theme="dark"
              style={{ position: 'fixed', inset: 0, zIndex: 4, pointerEvents: 'none' }}
            />
          )}
          <SearchBar onNavigate={searchWithWave} onActiveChange={setSearchActive} />
          <OnlineCount hidden={searchActive} />
          <QuickApps hidden={searchActive} onOpen={(href) => void navigate(href)} />
          <SideMenu activePanel={panel} onTogglePanel={(next) => setPanel(panel === next ? null : next)} />
          <Pins minimized={searchActive} onOpen={(href) => void navigate(href)} />
          <SocialLinks showLite />
        </>
      )}

      <SidePanelHost panel={panel}>
        {(id) => {
          if (id === 'proxy') return <ProxySwitcher />
          if (id === 'region') return <RegionMenu />
          if (id === 'customize') return <CustomizePanel onClose={() => setPanel(null)} />
          if (id === 'performance') return <PerformancePanel onClose={() => setPanel(null)} />
          if (id === 'info')
            return (
              <InfoPanel
                onClose={() => setPanel(null)}
                onOpenFeedback={() => setDialog('feedback')}
                onOpenLegal={(section) => {
                  setLegalSection(section)
                  setDialog('legal')
                }}
              />
            )
          return (
            <HistoryPanel
              onNavigate={(url) => {
                setPanel(null)
                void navigate(url)
              }}
            />
          )
        }}
      </SidePanelHost>

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
      <TransferOverlay />
      <ClipToaster />
      {wave && (
        <DistortionWave
          origin={wave.origin}
          phase={wave.phase}
          onCovered={onWaveCovered}
          onFinished={onWaveFinished}
        />
      )}
    </>
  )
}
