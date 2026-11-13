import { useEffect, useMemo, useRef, useState } from 'react'
import { createSaveBridge, type SaveBridge, type SaveState } from '@/lib/game-saves'
import { gameUrl, imageUrl, loadGames, type Game } from '@/lib/games'
import { pinsFull, pinGame } from '@/lib/pins'
import { usePins } from '@/hooks/use-pins'
import './games-page.css'

type Props = {
  /** `?q=` from the route, so a `/g mario` search lands filtered. */
  query?: string
  /** `#<gameId>` from the route: open that game straight away. */
  launchId?: string
}

export default function GamesPage({ query = '', launchId = '' }: Props) {
  const [games, setGames] = useState<Game[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading')
  const [search, setSearch] = useState(query)
  const [playing, setPlaying] = useState<Game | null>(null)
  const [toast, setToast] = useState('')
  const pinned = usePins()
  const pinnedIds = useMemo(() => new Set(pinned.map((pin) => pin.id)), [pinned])

  useEffect(() => {
    let alive = true
    void loadGames().then((list) => {
      if (!alive) return
      setGames(list)
      setState(list.length ? 'ready' : 'empty')
    })
    return () => {
      alive = false
    }
  }, [])

  // A pin or a `/g` pick carries the game id, so it opens without a second click.
  useEffect(() => {
    if (!launchId || !games.length) return
    const game = games.find((item) => item.id === launchId)
    if (game) setPlaying(game)
  }, [launchId, games])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(id)
  }, [toast])

  function pin(game: Game) {
    if (pinnedIds.has(game.id)) {
      setToast(`“${game.name}” is already pinned`)
      return
    }
    if (!pinGame(game)) {
      setToast('Pins are full — unpin one from the home row first')
      return
    }
    setToast(`Pinned “${game.name}”`)
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return games
    return games.filter((game) => game.name.toLowerCase().includes(needle))
  }, [games, search])

  return (
    <div className="games-page">
      {playing ? (
        <GamePlayer
          game={playing}
          pinned={pinnedIds.has(playing.id)}
          onPin={() => pin(playing)}
          onBack={() => setPlaying(null)}
        />
      ) : (
        <>
          <header className="games-page__head">
            <div className="games-page__heading">
              <h1 className="games-page__title">Games</h1>
              <span className="games-page__count">
                {state === 'ready' ? `${filtered.length} of ${games.length}` : 'loading…'}
              </span>
            </div>
            <label className="games-page__search">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <line x1="13.4" y1="13.4" x2="17.5" y2="17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={search}
                placeholder="Search games"
                aria-label="Search games"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </header>

          {state === 'empty' ? (
            <p className="games-page__note">The catalog could not be reached. Try again in a moment.</p>
          ) : filtered.length === 0 ? (
            <p className="games-page__note">No games match “{search.trim()}”.</p>
          ) : (
            <div className="games-page__grid">
              {filtered.map((game) => (
                <div key={game.id} className="games-page__cell">
                  <button type="button" className="games-page__tile" onClick={() => setPlaying(game)}>
                    <span className="games-page__cover">
                      <GameCover game={game} />
                    </span>
                    <span className="games-page__name">{game.name}</span>
                  </button>
                  <button
                    type="button"
                    className={`games-page__pin${pinnedIds.has(game.id) ? ' is-pinned' : ''}`}
                    aria-label={pinnedIds.has(game.id) ? `Unpin ${game.name} — pinned` : `Pin ${game.name}`}
                    title={pinnedIds.has(game.id) ? 'Pinned to the home row' : 'Pin to the home row'}
                    disabled={pinnedIds.has(game.id)}
                    onClick={() => pin(game)}
                  >
                    <PinIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {toast && <div className="games-page__toast">{toast}</div>}
    </div>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4h6l-1 5 3.5 3.5-4.5 1v5l-1 1-.8-6H6.5L10 9z" />
    </svg>
  )
}

/**
 * Covers come from the game CDN. The proxy service worker at scope `/` drops
 * cross-origin image loads, so they are fetched and shown as blob URLs, with the
 * glyph kept until the bytes arrive.
 */
function GameCover({ game }: { game: Game }) {
  const [url, setUrl] = useState<string | null>(null)
  const src = imageUrl(game)

  useEffect(() => {
    if (!src) return
    let alive = true
    let objectUrl: string | null = null
    fetch(src)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!alive || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {})
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  if (!url) {
    return (
      <svg className="games-page__glyph" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="7" width="18" height="10" rx="3" />
        <path d="M8 10v4M6 12h4" />
        <path d="M16 11.5h.01M18 13.5h.01" />
      </svg>
    )
  }

  return <img className="games-page__image" src={url} alt="" draggable={false} />
}

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

function GamePlayer({
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

  function saveClick() {
    const bridge = bridgeRef.current
    if (!bridge) return
    if (save.status === 'signedout') {
      window.dispatchEvent(new Event('plu:open-account'))
      return
    }
    bridge.saveNow()
  }

  // Leaving asks the game for a last snapshot, then gives it a moment to arrive
  // before the frame is torn down (v1's FINAL_SAVE_GRACE).
  function leave() {
    const bridge = bridgeRef.current
    if (!bridge || save.status === 'signedout' || save.status === 'silent') {
      onBack()
      return
    }
    bridge.requestSnapshot()
    window.setTimeout(onBack, 1200)
  }

  function fullscreen() {
    void frameRef.current?.requestFullscreen?.().catch(() => {})
  }

  return (
    <div className="games-page__player">
      <div className="games-page__bar">
        <button type="button" className="games-page__back" onClick={leave}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          All games
        </button>
        <span className="games-page__now">{game.name}</span>
        <button
          type="button"
          className={`games-page__action games-page__pin-btn${pinned ? ' is-pinned' : ''}`}
          onClick={onPin}
          disabled={pinned}
          title={pinned ? 'Pinned to the home row' : 'Pin to the home row'}
        >
          <PinIcon />
          {pinned ? 'Pinned' : 'Pin'}
        </button>
        <button
          type="button"
          className={`games-page__action games-page__save is-${save.status}`}
          onClick={saveClick}
          title={saveTitle(save)}
        >
          <SaveIcon status={save.status} />
          {SAVE_LABELS[save.status]}
        </button>
        <button type="button" className="games-page__action games-page__full" onClick={fullscreen}>
          Fullscreen
        </button>
      </div>
      <iframe
        ref={frameRef}
        className="games-page__frame"
        src={gameUrl(game)}
        title={game.name}
        allow="autoplay; fullscreen; gamepad; pointer-lock"
      />
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
