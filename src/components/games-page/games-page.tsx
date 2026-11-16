import { useEffect, useMemo, useRef, useState } from 'react'
import { BorderBeam } from 'border-beam'
import GamePlayer from '@/components/game-player/game-player'
import GlassHighlight from '@/components/glass-highlight/glass-highlight'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import { imageUrl, loadGames, searchGames, type Game } from '@/lib/games'
import { bootLumin, luminImage, luminPlayUrl, luminSearch, type LuminGame } from '@/lib/lumin'
import { pinGame } from '@/lib/pins'
import { usePins } from '@/hooks/use-pins'
import { BEAM_PROPS } from '@/lib/beam'
import './games-page.css'

type Props = {
  query?: string
  launchId?: string
}

type Source = 'pgcdn' | 'lumin'

export default function GamesPage({ query = '', launchId = '' }: Props) {
  const [games, setGames] = useState<Game[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading')
  const [search, setSearch] = useState(query)
  const [focused, setFocused] = useState(false)
  const [playing, setPlaying] = useState<Game | null>(null)
  const [toast, setToast] = useState('')
  const [source, setSource] = useState<Source>('pgcdn')
  const pinned = usePins()
  const pinnedIds = useMemo(() => new Set(pinned.map((pin) => pin.id)), [pinned])

  const [luminState, setLuminState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [luminError, setLuminError] = useState('')
  const [luminGames, setLuminGames] = useState<LuminGame[]>([])
  const [luminTotal, setLuminTotal] = useState(0)
  const [luminPages, setLuminPages] = useState(1)
  const [luminPage, setLuminPage] = useState(1)
  const [luminBusy, setLuminBusy] = useState(false)
  const [luminQuery, setLuminQuery] = useState('')
  const [luminPlay, setLuminPlay] = useState<{ game: LuminGame; url: string | null; error: string } | null>(null)

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
    if (pinnedIds.has(game.id)) return
    setToast(pinGame(game) ? `Pinned “${game.name}”` : 'Pins are full. Unpin one from the home row first.')
  }

  useEffect(() => {
    if (source !== 'lumin' || luminState !== 'idle') return
    setLuminState('loading')
    setLuminError('')
    bootLumin(document.querySelector('#lumin-container'))
      .then(() => luminSearch('', 1))
      .then((page) => {
        setLuminGames(page.games)
        setLuminTotal(page.total)
        setLuminPages(page.pages)
        setLuminPage(page.page)
        setLuminState('ready')
      })
      .catch((err: unknown) => {
        setLuminError(err instanceof Error ? err.message : 'The Lumin SDK failed to start')
        setLuminState('error')
      })
  }, [source, luminState])

  useEffect(() => {
    if (source !== 'lumin' || luminState !== 'ready') return
    const needle = search.trim()
    if (needle === luminQuery) return
    const timer = window.setTimeout(() => {
      setLuminBusy(true)
      luminSearch(needle, 1)
        .then((page) => {
          setLuminGames(page.games)
          setLuminTotal(page.total)
          setLuminPages(page.pages)
          setLuminPage(page.page)
          setLuminQuery(needle)
        })
        .catch(() => setToast('LuminSDK could not search right now'))
        .finally(() => setLuminBusy(false))
    }, 260)
    return () => window.clearTimeout(timer)
  }, [search, source, luminState, luminQuery])

  function moreLumin() {
    if (luminBusy || luminPage >= luminPages) return
    setLuminBusy(true)
    luminSearch(luminQuery, luminPage + 1)
      .then((page) => {
        setLuminGames((current) => [...current, ...page.games])
        setLuminPage(page.page)
        setLuminPages(page.pages)
      })
      .catch(() => setToast('LuminSDK could not load more games'))
      .finally(() => setLuminBusy(false))
  }

  function playLumin(game: LuminGame) {
    setLuminPlay({ game, url: null, error: '' })
    luminPlayUrl(game.id)
      .then((url) => setLuminPlay((current) => (current && current.game.id === game.id ? { ...current, url } : current)))
      .catch((err: unknown) =>
        setLuminPlay((current) =>
          current && current.game.id === game.id
            ? { ...current, error: err instanceof Error ? err.message : 'LuminSDK could not open this game' }
            : current,
        ),
      )
  }

  const results = useMemo(() => searchGames(games, source === 'pgcdn' ? search : ''), [games, search, source])

  if (luminPlay) {
    return (
      <div className="games-page">
        <LuminPlayer
          game={luminPlay.game}
          url={luminPlay.url}
          error={luminPlay.error}
          onBack={() => setLuminPlay(null)}
        />
      </div>
    )
  }

  if (playing) {
    return (
      <GamePlayer
        game={playing}
        pinned={pinnedIds.has(playing.id)}
        onPin={() => pin(playing)}
        onBack={() => setPlaying(null)}
      />
    )
  }

  return (
    <div className={`games-page${source === 'lumin' ? ' is-lumin' : ''}`}>
      {
        <div className="games-page__scroll">
          <header className="games-page__head">
            <h1 className="games-page__title">Games</h1>

            <div className="games-page__tabs-shell">
              <GlassSurface
                className="games-page__tabs-glass"
                width="100%"
                height="100%"
                borderRadius={999}
                backgroundOpacity={0.08}
                saturation={1.25}
                displace={0.4}
              >
                <div className="games-page__tabs" role="tablist" aria-label="Game sources">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={source === 'pgcdn'}
                    className={`games-page__tab${source === 'pgcdn' ? ' is-active' : ''}`}
                    onClick={() => setSource('pgcdn')}
                  >
                    {source === 'pgcdn' && <GlassHighlight radius={999} />}
                    <span className="games-page__tab-label">Plutonium-GCDN</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={source === 'lumin'}
                    className={`games-page__tab${source === 'lumin' ? ' is-active' : ''}`}
                    onClick={() => setSource('lumin')}
                  >
                    {source === 'lumin' && <GlassHighlight radius={999} />}
                    <span className="games-page__tab-label">LuminSDK</span>
                  </button>
                </div>
              </GlassSurface>
            </div>

            <div className={`games-page__search${focused ? ' is-focused' : ''}`}>
              <BorderBeam className="games-page__search-beam" {...BEAM_PROPS} borderRadius={999} active={focused}>
                <GlassSurface
                  className="games-page__search-glass"
                  width="100%"
                  height="100%"
                  borderRadius={999}
                  backgroundOpacity={0.1}
                  saturation={1.2}
                  displace={0.5}
                >
                  <form className="games-page__search-inner" onSubmit={(event) => event.preventDefault()}>
                    <svg className="games-page__search-icon" viewBox="0 0 20 20" aria-hidden="true">
                      <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <line
                        x1="13.4"
                        y1="13.4"
                        x2="17.5"
                        y2="17.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                    <input
                      className="games-page__search-input"
                      type="text"
                      aria-label="Search games"
                      placeholder="Search the library."
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      onFocus={() => setFocused(true)}
                      onBlur={() => setFocused(false)}
                    />
                  </form>
                </GlassSurface>
              </BorderBeam>
            </div>

            <p className="games-page__meta">
              {source === 'lumin'
                ? luminState === 'error'
                  ? 'unavailable'
                  : luminState === 'ready'
                    ? `${luminGames.length} of ${luminTotal}`
                    : 'loading…'
                : state === 'ready'
                  ? search.trim()
                    ? `${results.length} of ${games.length}`
                    : `${games.length} games`
                  : 'loading…'}
            </p>
          </header>

          <div id="lumin-container" className="games-page__lumin" aria-hidden="true" />

          {source === 'lumin' ? (
            luminState === 'error' ? (
              <div className="games-page__note games-page__note--lumin">
                <p>LuminSDK could not start: {luminError}</p>
                <button type="button" className="games-page__retry" onClick={() => setLuminState('idle')}>
                  Try again
                </button>
              </div>
            ) : luminState !== 'ready' ? (
              <p className="games-page__note">Starting LuminSDK…</p>
            ) : luminGames.length === 0 ? (
              <p className="games-page__note">No LuminSDK games match “{search.trim()}”.</p>
            ) : (
              <>
                <div className="games-page__grid">
                  {luminGames.map((game) => (
                    <button
                      key={game.id}
                      type="button"
                      className="games-page__card"
                      onClick={() => playLumin(game)}
                    >
                      <LuminCover token={game.image_token} />
                      <span className="games-page__card-name">{game.name}</span>
                    </button>
                  ))}
                </div>
                {luminPage < luminPages && (
                  <div className="games-page__more">
                    <button type="button" className="games-page__retry" onClick={moreLumin} disabled={luminBusy}>
                      {luminBusy ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )
          ) : state === 'empty' ? (
            <p className="games-page__note">The catalog could not be reached. Try again in a moment.</p>
          ) : results.length === 0 ? (
            <p className="games-page__note">No games match “{search.trim()}”.</p>
          ) : (
            <div className="games-page__grid">
              {results.map((game) => (
                <button key={game.id} type="button" className="games-page__card" onClick={() => setPlaying(game)}>
                  <GameCover game={game} />
                  <span className="games-page__card-name">{game.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      }

      {toast && <div className="games-page__toast">{toast}</div>}
    </div>
  )
}



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

  if (!url) return <EmptyCover />
  return <img className="games-page__cover" src={url} alt="" draggable={false} />
}

function LuminCover({ token }: { token: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setUrl(null)
    void luminImage(token).then((next) => {
      if (alive && next) setUrl(next)
    })
    return () => {
      alive = false
    }
  }, [token])

  if (!url) return <EmptyCover />
  return <img className="games-page__cover" src={url} alt="" draggable={false} loading="lazy" />
}

function EmptyCover() {
  return (
    <span className="games-page__cover-empty">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="7" width="18" height="10" rx="3" />
        <path d="M8 10v4M6 12h4" />
        <path d="M16 11.5h.01M18 13.5h.01" />
      </svg>
    </span>
  )
}

function LuminPlayer({
  game,
  url,
  error,
  onBack,
}: {
  game: LuminGame
  url: string | null
  error: string
  onBack: () => void
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)

  function fullscreen() {
    void frameRef.current?.requestFullscreen?.().catch(() => {})
  }

  return (
    <div className="games-page__player">
      <div className="games-page__bar">
        <button type="button" className="games-page__back" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          All games
        </button>
        <span className="games-page__now">{game.name}</span>
        <button type="button" className="games-page__action games-page__full" onClick={fullscreen}>
          Fullscreen
        </button>
      </div>
      {error ? (
        <p className="games-page__note">{error}</p>
      ) : url ? (
        <iframe
          ref={frameRef}
          className="games-page__frame"
          src={url}
          title={game.name}
          allow="autoplay; fullscreen; gamepad; pointer-lock"
        />
      ) : (
        <p className="games-page__note">Opening {game.name}…</p>
      )}
    </div>
  )
}
