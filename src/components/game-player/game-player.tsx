import { useEffect, useRef, useState } from 'react'
import ClipButton from '@/components/clip-button/clip-button'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import { createSaveBridge, type SaveBridge, type SaveState } from '@/lib/game-saves'
import { gameUrl, imageUrl, type Game } from '@/lib/games'
import './game-player.css'

const SAVE_LABELS: Record<SaveState['status'], string> = {
  signedout: 'Sign in to save',
  loading: 'Restoring…',
  ready: 'Cloud saves',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Retry sync',
  silent: 'No save sync',
}

function saveTitle(state: SaveState) {
  if (state.detail) return state.detail
  if (state.status === 'saved' && state.savedAt) {
    const minutes = Math.round((Date.now() - state.savedAt) / 60000)
    return `Saved to your account${minutes > 0 ? ` · ${minutes}m ago` : ' · just now'}`
  }
  return 'Cloud saves: your progress follows your account'
}

function elapsedLabel(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function GamePlayer({
  game,
  pinned,
  onPin,
  onBack,
}: {
  game: Game
  pinned: boolean
  onPin: () => void
  onBack: () => void
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const bridgeRef = useRef<SaveBridge | null>(null)
  const [save, setSave] = useState<SaveState>({ status: 'ready', savedAt: null })
  const [bumped, setBumped] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [cover, setCover] = useState<string | null>(null)

  useEffect(() => {
    const bridge = createSaveBridge(game.id, () => frameRef.current)
    bridgeRef.current = bridge
    const stop = bridge.subscribe(() => setSave(bridge.getState()))
    bridge.restore()
    return () => {
      stop()
      bridge.dispose()
      bridgeRef.current = null
    }
  }, [game.id])

  useEffect(() => {
    const src = imageUrl(game)
    if (!src) return
    let alive = true
    let objectUrl: string | null = null
    fetch(src)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!alive || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setCover(objectUrl)
      })
      .catch(() => {})
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [game])

  useEffect(() => {
    setSeconds(0)
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [game.id, bumped])

  function saveClick() {
    const bridge = bridgeRef.current
    if (!bridge) return
    if (save.status === 'signedout') {
      window.dispatchEvent(new Event('plu:open-account'))
      return
    }
    bridge.saveNow()
  }

  function leave() {
    const bridge = bridgeRef.current
    if (!bridge || save.status === 'signedout' || save.status === 'silent') {
      onBack()
      return
    }
    bridge.requestSnapshot()
    window.setTimeout(onBack, 1200)
  }

  function reload() {
    const frame = frameRef.current
    if (frame) frame.src = gameUrl(game)
    setBumped((value) => value + 1)
  }

  function fullscreen() {
    void frameRef.current?.requestFullscreen?.().catch(() => {})
  }

  return (
    <div className="game-player">
      <iframe
        ref={frameRef}
        className="game-player__frame"
        src={gameUrl(game)}
        title={game.name}
        allow="autoplay; fullscreen; gamepad; pointer-lock"
      />

      <div className="game-player__dock" role="toolbar" aria-label="Game controls">
        <GlassSurface
          className="game-player__glass"
          width="100%"
          height="100%"
          borderRadius={999}
          backgroundOpacity={0.12}
          saturation={1.25}
          displace={0.45}
        >
          <div className="game-player__dock-inner">
            <div className="game-player__identity">
              {cover ? (
                <img className="game-player__cover" src={cover} alt="" draggable={false} />
              ) : (
                <span className="game-player__cover game-player__cover--empty" />
              )}
              <span className="game-player__meta">
                <span className="game-player__name">{game.name}</span>
                <span className="game-player__timer">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5v5l3 1.8" />
                  </svg>
                  {elapsedLabel(seconds)}
                </span>
              </span>
            </div>

            <span className="game-player__divider" />

            <div className="game-player__group">
              <button type="button" className="game-player__btn" onClick={reload} title="Reload game">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 12a8 8 0 1 0 2.6-5.9" />
                  <path d="M4 4.5V10h5.5" />
                </svg>
              </button>
              <ClipButton
                variant="bare"
                className="game-player__btn"
                target={() => frameRef.current}
                label={() => game.name}
                source="game"
              />
              <button type="button" className="game-player__btn" onClick={fullscreen} title="Fullscreen">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5" />
                </svg>
              </button>
              <button
                type="button"
                className={`game-player__btn game-player__pin${pinned ? ' is-on' : ''}`}
                onClick={onPin}
                disabled={pinned}
                title={pinned ? 'Pinned to the home row' : 'Pin to the home row'}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 4h6l-1 5 3.5 3.5-4.5 1v5l-1 1-.8-6H6.5L10 9z" />
                </svg>
              </button>
            </div>

            <span className="game-player__divider" />

            <button
              type="button"
              className={`game-player__save is-${save.status}`}
              onClick={saveClick}
              title={saveTitle(save)}
            >
              <SaveIcon status={save.status} />
              <span>{SAVE_LABELS[save.status]}</span>
            </button>

            <span className="game-player__divider" />

            <button type="button" className="game-player__exit" onClick={leave} title="Back to games">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
              Games
            </button>
          </div>
        </GlassSurface>
      </div>
    </div>
  )
}

function SaveIcon({ status }: { status: SaveState['status'] }) {
  const cloud = 'M7 17.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.3 9a3.8 3.8 0 0 1 .2 7.5'
  if (status === 'signedout') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={cloud} />
        <path d="M4 4l16 16" />
      </svg>
    )
  }
  if (status === 'saving' || status === 'loading') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="is-spinning">
        <path d="M12 4a8 8 0 1 0 8 8" />
      </svg>
    )
  }
  if (status === 'error' || status === 'silent') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={cloud} />
        <path d="M12 12v4M12 9h.01" />
      </svg>
    )
  }
  if (status === 'saved') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={cloud} />
        <path d="M9.2 14.4l1.9 1.9 3.7-3.7" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={cloud} />
      <path d="M12 9.5v6M9.5 12.5 12 15l2.5-2.5" />
    </svg>
  )
}
