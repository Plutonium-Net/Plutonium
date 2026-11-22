import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ensureAccount,
  startStream,
  type CgAccount,
  type CgGame,
  type CgQueueProgress,
  type CgRegion,
  type CgSession,
} from '@/lib/cgapi'
import { CgPlayer } from '@/lib/cg-player'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import './cloud-player.css'

type Stage = 'account' | 'queue' | 'connecting' | 'retrying' | 'playing' | 'error'

function GlassButton({
  children,
  onClick,
  primary = false,
  end = false,
  buttonClassName = '',
}: {
  children: ReactNode
  onClick: () => void
  primary?: boolean
  end?: boolean
  buttonClassName?: string
}) {
  return (
    <span className={`cg-player__glass-button${primary ? ' is-primary' : ''}${end ? ' is-end' : ''}`}>
      <GlassSurface
        className="cg-player__glass-button__glass"
        width="100%"
        height="100%"
        borderRadius={end ? 9 : 999}
        backgroundOpacity={primary ? 0.3 : end ? 0.1 : 0.08}
        saturation={1.3}
        displace={0.4}
      />
      <button type="button" className={`cg-player__button ${buttonClassName}`.trim()} onClick={onClick}>
        {children}
      </button>
    </span>
  )
}

function GlassIconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <span className="cg-player__glass-icon">
      <GlassSurface
        className="cg-player__glass-icon__glass"
        width="100%"
        height="100%"
        borderRadius={9}
        backgroundOpacity={0.12}
        saturation={1.3}
        displace={0.4}
      />
      <button type="button" className="cg-player__icon" aria-label={label} onClick={onClick}>
        {children}
      </button>
    </span>
  )
}

export default function CloudPlayer({
  game,
  region,
  onClose,
}: {
  game: CgGame
  region: CgRegion
  onClose: () => void
}) {
  const [stage, setStage] = useState<Stage>('account')
  const [queue, setQueue] = useState<CgQueueProgress | null>(null)
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [muted, setMuted] = useState(false)
  const accountFailed = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const controller = new AbortController()
    let player: CgPlayer | null = null
    let disposed = false

    setStage('account')
    setQueue(null)
    setMessage('')

    void (async () => {
      let account: CgAccount
      try {
        // Only a failed account step needs a fresh account on retry; a failed
        // session can reuse the one already cached.
        account = await ensureAccount(region, { force: accountFailed.current })
        accountFailed.current = false
      } catch (error) {
        if (disposed) return
        accountFailed.current = true
        setStage('error')
        setMessage(error instanceof Error ? error.message : 'A game account could not be issued')
        return
      }
      if (disposed) return

      try {
        let session: CgSession | null = null
        for (let round = 1; !session; round += 1) {
          try {
            session = await startStream(
              region,
              account,
              { id: game.game_id, name: game.title },
              {
                signal: controller.signal,
                onQueue: (progress) => {
                  if (disposed) return
                  setQueue(progress)
                  setStage('queue')
                },
              },
            )
          } catch (error) {
            // The origin sometimes closes the SSE stream before a machine is
            // assigned; give it a couple more tries before surfacing the error.
            if (disposed || controller.signal.aborted) return
            if (round >= 3) throw error
            setStage('retrying')
            await new Promise((resolve, reject) => {
              const timer = window.setTimeout(resolve, 2000 * round)
              controller.signal.addEventListener(
                'abort',
                () => {
                  window.clearTimeout(timer)
                  reject(new Error('cancelled'))
                },
                { once: true },
              )
            })
          }
        }
        if (disposed) return
        setStage('connecting')
        player = new CgPlayer({
          region,
          server: session.server,
          token: session.execToken,
          game: game.title,
          video,
          onPhase: (phase) => {
            if (!disposed && phase === 'connected') setStage('playing')
          },
          onError: (reason) => {
            if (disposed) return
            setStage('error')
            setMessage(reason)
          },
        })
        player.start()
      } catch (error) {
        if (disposed || controller.signal.aborted) return
        setStage('error')
        setMessage(error instanceof Error ? error.message : 'The session could not be started')
      }
    })()

    return () => {
      disposed = true
      controller.abort()
      player?.close()
    }
  }, [attempt, game.game_id, game.title, region])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.fullscreenElement) closeRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const node = shellRef.current
    if (!node) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    void node.requestFullscreen?.().catch(() => {})
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }, [])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  const status =
    stage === 'account'
      ? 'Issuing a game account…'
      : stage === 'queue'
        ? queue && queue.position > 0
          ? `Waiting for a free machine · position ${queue.position}`
          : 'Waiting for a free machine…'
        : stage === 'retrying'
          ? 'Reconnecting to the game server…'
          : 'Connecting to the game server…'

  return createPortal(
    <div className="cg-player" role="dialog" aria-modal="true" aria-label={`${game.title} session`}>
      <div className="cg-player__shell" ref={shellRef}>
        <video
          ref={videoRef}
          className="cg-player__video"
          autoPlay
          playsInline
          onClick={() => {
            const video = videoRef.current
            if (video?.paused) void video.play().catch(() => {})
          }}
        />

        {stage !== 'playing' && (
          <div className="cg-player__status">
            {stage === 'error' ? (
              <div className="cg-player__card">
                <GlassSurface
                  className="cg-player__card-glass"
                  width="100%"
                  height="100%"
                  borderRadius={18}
                  backgroundOpacity={0.18}
                  saturation={1.3}
                  displace={0.35}
                />
                <div className="cg-player__card-inner">
                  <h2 className="cg-player__heading">{game.title} could not start</h2>
                  <p className="cg-player__detail">{message}</p>
                  <div className="cg-player__buttons">
                    <GlassButton primary onClick={retry}>
                      Try again
                    </GlassButton>
                    <GlassButton onClick={onClose}>Close</GlassButton>
                  </div>
                </div>
              </div>
            ) : (
              <div className="cg-player__waiting">
                <span className="cg-player__spinner" aria-hidden="true" />
                <p className="cg-player__phase">{status}</p>
                <p className="cg-player__hint">
                  {region.name}
                  {stage === 'queue' && queue && queue.retryIn > 0 ? ` · retrying every ${queue.retryIn}s` : ''}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="cg-player__bar">
          <GlassSurface
            className="cg-player__bar-glass"
            width="100%"
            height="100%"
            borderRadius={14}
            backgroundOpacity={0.14}
            saturation={1.25}
            displace={0.35}
          />
          <div className="cg-player__bar-inner">
            <span className="cg-player__title">
              <span className={`cg-player__dot is-${stage === 'playing' ? 'live' : stage === 'error' ? 'down' : 'waiting'}`} />
              {game.title}
            </span>
            <div className="cg-player__tools">
              <GlassIconButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
                  {muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 010 7" />}
                </svg>
              </GlassIconButton>
              <GlassIconButton label="Toggle fullscreen" onClick={toggleFullscreen}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
              </GlassIconButton>
              <GlassButton end buttonClassName="cg-player__end" onClick={onClose}>
                End session
              </GlassButton>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
