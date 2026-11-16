import { useEffect, useRef, useState } from 'react'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import { currentSession, onAuthChange, type CloudUser } from '@/lib/cloud-store'
import { SESSION_SECONDS, clock, createVmSession, endVmSession, type VmSession } from '@/lib/vms'
import './vms-page.css'

type Phase = 'idle' | 'starting' | 'active'

export default function VmsPage({ autostart = false }: { autostart?: boolean }) {
  const [user, setUser] = useState<CloudUser | null>(() => currentSession())
  const [phase, setPhase] = useState<Phase>('idle')
  const [session, setSession] = useState<VmSession | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => onAuthChange(setUser), [])

  useEffect(() => {
    if (phase !== 'active') return
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [phase, session?.sessionId])

  async function start() {
    const account = currentSession()
    if (!account) {
      setNote('Sign in to launch a virtual machine.')
      window.dispatchEvent(new Event('plu:open-account'))
      return
    }
    setPhase('starting')
    setError('')
    setNote('')
    try {
      const created = await createVmSession(account.idToken)
      setSession(created)
      setSecondsLeft(SESSION_SECONDS)
      setPhase('active')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The session could not be created')
      setPhase('idle')
    }
  }

  async function stop(auto = false) {
    const ending = session
    setPhase('idle')
    setSession(null)
    setSecondsLeft(SESSION_SECONDS)
    setNote(auto ? 'Session ended automatically after fifteen minutes.' : 'Session ended.')
    await endVmSession(ending?.sessionId ?? null, currentSession()?.idToken ?? null)
  }

  useEffect(() => {
    if (phase === 'active' && secondsLeft === 0) void stop(true)
  }, [phase, secondsLeft])

  useEffect(() => {
    if (!autostart || !currentSession()) return
    void start()
  }, [])

  function fullscreen() {
    const stage = stageRef.current
    if (!stage) return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void stage.requestFullscreen?.().catch(() => {})
  }

  const active = phase === 'active'
  const starting = phase === 'starting'
  const expiring = active && secondsLeft <= 60

  return (
    <div className="vms-page">
      <div className="vms-page__scroll">
        <header className="vms-page__head">
          <h1 className="vms-page__title">VMs</h1>
          <p className="vms-page__subtitle">
            Launch a temporary cloud browser session directly inside Plutonium Network.
          </p>
        </header>

        <div className="vms-page__stack">
        <div className="vms-stage" ref={stageRef}>
          <GlassSurface
            className="vms-stage__glass"
            width="100%"
            height="100%"
            borderRadius={18}
            backgroundOpacity={0.1}
            saturation={1.25}
            displace={0.5}
          >
            <div className="vms-stage__remote">
              {active && session ? (
                <iframe
                  className="vms-stage__frame"
                  src={session.embedUrl}
                  title="Virtual machine"
                  allow="camera; microphone; autoplay; fullscreen; clipboard-read; clipboard-write; display-capture"
                  allowFullScreen
                />
              ) : (
                <div className="vms-empty">
                  <span className="vms-empty__mark">
                    <VmMark size={40} />
                  </span>
                  <span className="vms-empty__title">
                    {starting
                      ? 'Creating remote session…'
                      : error
                        ? 'The session could not start'
                        : 'No browser session running'}
                  </span>
                  <span className="vms-empty__subtitle">
                    {starting
                      ? 'The worker is provisioning a temporary browser for you.'
                      : error
                        ? error
                        : user
                          ? 'Start a session below to load your virtual machine here.'
                          : 'Sign in, then start a session below to load your virtual machine here.'}
                  </span>
                  {!user && !starting && (
                    <button
                      type="button"
                      className="vms-btn vms-btn--inline"
                      onClick={() => window.dispatchEvent(new Event('plu:open-account'))}
                    >
                      Sign in
                    </button>
                  )}
                </div>
              )}
            </div>
          </GlassSurface>
        </div>

        <div className="vms-controls-shell">
          <GlassSurface
            className="vms-controls__glass"
            width="100%"
            height="100%"
            borderRadius={16}
            backgroundOpacity={0.09}
            saturation={1.28}
            displace={0.45}
          >
            <div className="vms-controls">
              <div className="vms-status">
                <span className={`vms-status__dot${active ? ' is-live' : ''}`} />
                <span className="vms-status__copy">
                  <span className="vms-status__title">Session</span>
                  <span className={`vms-status__value${active ? ' is-live' : ''}${expiring ? ' is-warning' : ''}`}>
                    {starting ? 'Creating session…' : active ? 'Session active' : 'No active session'}
                  </span>
                </span>
                {active && (
                  <span className={`vms-timer${expiring ? ' is-warning' : ''}`}>
                    <ClockIcon />
                    {clock(secondsLeft)}
                  </span>
                )}
              </div>

              <div className="vms-actions">
                <button
                  type="button"
                  className="vms-btn vms-btn--primary"
                  onClick={() => void start()}
                  disabled={starting || active}
                >
                  <PlayIcon />
                  Start Session
                </button>
                <button type="button" className="vms-btn" onClick={() => void stop()} disabled={!active}>
                  <StopIcon />
                  End Session
                </button>
                <button type="button" className="vms-btn" onClick={fullscreen} disabled={!active}>
                  <ExpandIcon />
                  Fullscreen
                </button>
              </div>
            </div>
          </GlassSurface>
        </div>

        <p className="vms-page__footnote">
          <CloudIcon />
          <span>
            Each session runs in the cloud, expires after fifteen minutes, and ending it destroys the temporary browser.
          </span>
        </p>

        {(note || error) && <p className="vms-page__message">{error || note}</p>}
        </div>
      </div>
    </div>
  )
}

function VmMark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="2.5" opacity=".22" />
      <circle cx="50" cy="50" r="33" fill="none" stroke="currentColor" strokeWidth="3" opacity=".6" />
      <rect x="30" y="33" width="40" height="27" rx="5" fill="none" stroke="currentColor" strokeWidth="5" />
      <path d="M32 41h36" stroke="currentColor" strokeWidth="2.5" opacity=".5" />
      <path d="M45.5 46l4.5 4.5-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M52.5 55h4" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M50 60v7" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M42 70h16" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <circle cx="78.5" cy="33.5" r="4" fill="currentColor" opacity=".85" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5l10 6.5-10 6.5z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.6" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5" />
    </svg>
  )
}

function CloudIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 18a4 4 0 0 1-.4-7.98A5.5 5.5 0 0 1 17.3 9.2 3.9 3.9 0 0 1 17 18z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5l3 1.8" />
    </svg>
  )
}
