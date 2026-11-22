import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BorderBeam } from 'border-beam'
import GlassHighlight from '@/components/glass-highlight/glass-highlight'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import { BEAM_PROPS } from '@/lib/beam'
import {
  CG_REGIONS,
  fetchCatalog,
  fetchGenres,
  gameArt,
  probeHealth,
  type CgGame,
  type CgGenre,
  type CgHealth,
  type CgRegion,
} from '@/lib/cgapi'
import { getPref, setPref } from '@/lib/prefs'
import CloudPlayer from './cloud-player'
import './cloud-gaming-page.css'

const REGION_KEY = 'cgRegion'
const BATCH = 60
const COLLAPSED_GENRES = 8

function savedRegion(): CgRegion {
  const id = getPref<string>(REGION_KEY)
  return CG_REGIONS.find((region) => region.id === id) ?? CG_REGIONS[0]
}

function playersLabel(game: CgGame) {
  const min = game.min_players ?? 1
  const max = game.max_players ?? min
  if (max <= 1) return '1 player'
  return `${min}–${max} players`
}

export default function CloudGamingPage() {
  const [region, setRegion] = useState<CgRegion>(savedRegion)
  const [health, setHealth] = useState<Record<string, CgHealth>>({})
  const [games, setGames] = useState<CgGame[]>([])
  const [genres, setGenres] = useState<CgGenre[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reload, setReload] = useState(0)
  const [genre, setGenre] = useState('All')
  const [catsOpen, setCatsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [limit, setLimit] = useState(BATCH)
  const [openGame, setOpenGame] = useState<CgGame | null>(null)
  const [playingGame, setPlayingGame] = useState<CgGame | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const autoRegion = useRef(!CG_REGIONS.some((entry) => entry.id === getPref<string>(REGION_KEY)))
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const controllers = new Set<AbortController>()

    function probe() {
      for (const entry of CG_REGIONS) {
        const controller = new AbortController()
        controllers.add(controller)
        void probeHealth(entry, controller.signal).then((result) => {
          controllers.delete(controller)
          if (alive) setHealth((current) => ({ ...current, [entry.id]: result }))
        })
      }
    }

    probe()
    const timer = window.setInterval(probe, 30_000)
    return () => {
      alive = false
      window.clearInterval(timer)
      controllers.forEach((controller) => controller.abort())
    }
  }, [])

  useEffect(() => {
    if (!autoRegion.current) return
    if (CG_REGIONS.some((entry) => !health[entry.id])) return
    const fastest = CG_REGIONS.filter((entry) => health[entry.id]?.state === 'up').sort(
      (a, b) => (health[a.id]?.ms ?? Infinity) - (health[b.id]?.ms ?? Infinity),
    )[0]
    autoRegion.current = false
    if (fastest && fastest.id !== region.id) setRegion(fastest)
  }, [health, region.id])

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setGames([])
    setGenres([])
    setGenre('All')
    setCatsOpen(false)
    setLimit(BATCH)
    void Promise.all([fetchCatalog(region, controller.signal), fetchGenres(region, controller.signal)])
      .then(([catalog, genreList]) => {
        if (controller.signal.aborted) return
        setGames(catalog)
        setGenres(genreList)
        setStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })
    return () => controller.abort()
  }, [region.id, reload])

  useEffect(() => {
    setLimit(BATCH)
  }, [genre, query])

  useEffect(() => {
    if (!openGame) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !playingGame) setOpenGame(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openGame, playingGame])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return games.filter((game) => {
      if (genre !== 'All' && !(game.genres || []).some((entry) => entry.id === genre)) return false
      if (!needle) return true
      const haystack = `${game.title} ${(game.genres || []).map((entry) => entry.name).join(' ')}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [games, genre, query])

  const shown = visible.slice(0, limit)

  useEffect(() => {
    if (status !== 'ready' || shown.length >= visible.length) return
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        setLimit((value) => Math.min(value + BATCH, visible.length))
      },
      { root: scrollRef.current, rootMargin: '800px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [status, shown.length, visible.length])
  const live = health[region.id] ?? { state: 'checking' as const, ms: null }
  const countLabel = status === 'loading' ? 'loading…' : status === 'error' ? 'unavailable' : `${visible.length} games`

  function chooseRegion(next: CgRegion) {
    autoRegion.current = false
    setRegion(next)
    setPref(REGION_KEY, next.id)
  }

  return (
    <div className="cg-page">
      <div className="cg-page__scroll" ref={scrollRef}>
        <header className="cg-page__head">
          <h1 className="cg-page__title">Cloud Gaming</h1>
          <p className="cg-page__subtitle">
            Stream the catalog through the CGAPI region closest to you.
          </p>

          <div className="cg-region-picker" ref={pickerRef}>
            <div className={`cg-region-select${menuOpen ? ' is-open' : ''}`}>
              <GlassSurface
                className="cg-region-select__glass"
                width="100%"
                height="100%"
                borderRadius={999}
                backgroundOpacity={menuOpen ? 0.16 : 0.08}
                saturation={1.25}
                displace={0.35}
              />
              <button
                type="button"
                className="cg-region-select__button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                aria-label={`Region: ${region.name}`}
              >
                <span className={`cg-page__dot is-${live.state}`} />
                <span>{region.short}</span>
                {live.state === 'up' && <span className="cg-region-select__ms">{live.ms} ms</span>}
                <svg className="cg-region-select__chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>

            {menuOpen && (
              <div className="cg-region-menu" role="listbox" aria-label="CGAPI region">
                <GlassSurface
                  className="cg-region-menu__glass"
                  width="100%"
                  height="100%"
                  borderRadius={14}
                  backgroundOpacity={0.16}
                  saturation={1.3}
                  displace={0.4}
                />
                <div className="cg-region-menu__list">
                  {CG_REGIONS.map((entry) => {
                    const state = health[entry.id]?.state ?? 'checking'
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        role="option"
                        aria-selected={entry.id === region.id}
                        className={`cg-region-menu__item${entry.id === region.id ? ' is-active' : ''}`}
                        onClick={() => {
                          chooseRegion(entry)
                          setMenuOpen(false)
                        }}
                      >
                        <span className={`cg-page__dot is-${state}`} />
                        <span className="cg-region-menu__name">{entry.short}</span>
                        <span className="cg-region-menu__ms">
                          {state === 'up' ? `${health[entry.id]?.ms ?? '–'} ms` : state === 'down' ? 'down' : '…'}
                        </span>
                        {entry.id === region.id && (
                          <svg className="cg-region-menu__check" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="cg-page__cats">
            <GlassChip active={genre === 'All'} onClick={() => setGenre('All')}>
              All
            </GlassChip>
            {(catsOpen ? genres : genres.slice(0, COLLAPSED_GENRES)).map((entry) => (
              <GlassChip key={entry.id} active={genre === entry.id} onClick={() => setGenre(entry.id)}>
                {entry.name}
              </GlassChip>
            ))}
            {!catsOpen && genres.length > COLLAPSED_GENRES && (
              <GlassChip more onClick={() => setCatsOpen(true)}>
                Show more categories
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </GlassChip>
            )}
          </div>

          <div className={`cg-page__search${focused ? ' is-focused' : ''}`}>
            <BorderBeam className="cg-page__search-beam" {...BEAM_PROPS} borderRadius={999} active={focused}>
              <GlassSurface
                className="cg-page__search-glass"
                width="100%"
                height="100%"
                borderRadius={999}
                backgroundOpacity={0.1}
                saturation={1.2}
                displace={0.5}
              >
                <form className="cg-page__search-inner" onSubmit={(event) => event.preventDefault()}>
                  <svg className="cg-page__search-icon" viewBox="0 0 20 20" aria-hidden="true">
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
                    className="cg-page__search-input"
                    type="search"
                    value={query}
                    placeholder="Search cloud games"
                    aria-label="Search cloud games"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setQuery(event.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                  />
                </form>
              </GlassSurface>
            </BorderBeam>
          </div>

          <p className="cg-page__meta">{countLabel}</p>
        </header>

        {status === 'error' ? (
          <div className="cg-page__error">
            <p>The {region.short} catalog could not be reached.</p>
            <button type="button" className="cg-page__more" onClick={() => setReload((value) => value + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <div className="cg-page__grid">
            {shown.map((game) => (
              <GameCard key={game.game_id} game={game} onOpen={() => setOpenGame(game)} />
            ))}
            {status === 'loading' &&
              Array.from({ length: 12 }, (_, index) => <span key={`skeleton-${index}`} className="cg-page__skeleton" />)}
          </div>
        )}

        {status === 'ready' && !visible.length && (
          <p className="cg-page__note">
            {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Nothing in this category yet.'}
          </p>
        )}

        {status === 'ready' && shown.length < visible.length && <div className="cg-page__sentinel" ref={sentinelRef} />}
      </div>

      {openGame && (
        <GameDetail
          game={openGame}
          region={region}
          live={live}
          onClose={() => setOpenGame(null)}
          onPlay={() => setPlayingGame(openGame)}
        />
      )}

      {playingGame && (
        <CloudPlayer game={playingGame} region={region} onClose={() => setPlayingGame(null)} />
      )}
    </div>
  )
}

function GlassChip({
  active = false,
  more = false,
  onClick,
  children,
}: {
  active?: boolean
  more?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <span className={`cg-chip${active ? ' is-active' : ''}${more ? ' cg-chip--more' : ''}`}>
      <GlassSurface
        className="cg-chip__glass"
        width="100%"
        height="100%"
        borderRadius={999}
        backgroundOpacity={active ? 0.14 : 0.05}
        saturation={1.25}
        displace={0.3}
      />
      {active && <GlassHighlight radius={999} />}
      <button type="button" className="cg-chip__button" aria-pressed={active} onClick={onClick}>
        {children}
      </button>
    </span>
  )
}

function GameCard({ game, onOpen }: { game: CgGame; onOpen: () => void }) {
  const [broken, setBroken] = useState(false)
  const art = gameArt(game)

  return (
    <button type="button" className="cg-card" onClick={onOpen}>
      {art && !broken ? (
        <img className="cg-card__art" src={art} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />
      ) : (
        <span className="cg-card__art cg-card__art--empty" />
      )}
      <span className="cg-card__veil" />
      {typeof game.min_age === 'number' && game.min_age > 0 && <span className="cg-card__age">{game.min_age}+</span>}
      <span className="cg-card__copy">
        <span className="cg-card__name">{game.title}</span>
        <span className="cg-card__genres">
          {(game.genres || []).map((entry) => entry.name).join(' · ') || playersLabel(game)}
        </span>
      </span>
    </button>
  )
}

function GameDetail({
  game,
  region,
  live,
  onClose,
  onPlay,
}: {
  game: CgGame
  region: CgRegion
  live: CgHealth
  onClose: () => void
  onPlay: () => void
}) {
  const [broken, setBroken] = useState(false)
  const art = gameArt(game, true)

  return createPortal(
    <div
      className="cg-modal"
      role="dialog"
      aria-modal="true"
      aria-label={game.title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="cg-modal__shell">
        <GlassSurface
          className="cg-modal__glass"
          width="100%"
          height="100%"
          borderRadius={18}
          backgroundOpacity={0.16}
          saturation={1.3}
          displace={0.5}
        >
          <div className="cg-modal__body">
            <button type="button" className="cg-modal__close" onClick={onClose} aria-label="Close game">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>

            <div className="cg-modal__art">
              {art && !broken ? (
                <img src={art} alt="" onError={() => setBroken(true)} />
              ) : (
                <span className="cg-modal__art-empty" />
              )}
              <span className="cg-modal__art-veil" />
            </div>

            <div className="cg-modal__copy">
              <h2 className="cg-modal__title">{game.title}</h2>
              <div className="cg-modal__chips">
                {(game.genres || []).map((entry) => (
                  <span key={entry.id} className="cg-modal__chip">
                    {entry.name}
                  </span>
                ))}
                <span className="cg-modal__chip">{playersLabel(game)}</span>
                {typeof game.min_age === 'number' && game.min_age > 0 && (
                  <span className="cg-modal__chip">{game.min_age}+</span>
                )}
              </div>

              <p className="cg-modal__desc">{game.description || 'No description available for this game yet.'}</p>

              <button type="button" className="cg-modal__play" onClick={onPlay}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
                Play now
              </button>

              <p className="cg-modal__source">
                <span className={`cg-page__dot is-${live.state}`} />
                Catalog served by {region.name}
                <code>{region.host}</code>
                {live.state === 'up' && <span>{live.ms} ms</span>}
              </p>
            </div>
          </div>
        </GlassSurface>
      </div>
    </div>,
    document.body,
  )
}
