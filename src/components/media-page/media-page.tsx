import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BorderBeam } from 'border-beam'
import GlassHighlight from '@/components/glass-highlight/glass-highlight'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import { BEAM_PROPS } from '@/lib/beam'
import {
  KIND_LABEL,
  KIND_WORD,
  SEARCH_HINT,
  isAdultCert,
  loadCatalog,
  loadDetails,
  loadEpisodes,
  posterUrl,
  searchCatalog,
  vidcoreUrl,
  type MediaDetails,
  type MediaEpisode,
  type MediaItem,
  type MediaKind,
} from '@/lib/media'
import './media-page.css'

const SECTIONS: { kind: MediaKind; label: string }[] = [
  { kind: 'movie', label: 'Movies' },
  { kind: 'tv', label: 'TV Shows' },
  { kind: 'anime', label: 'Anime' },
]

export default function MediaPage() {
  const [kind, setKind] = useState<MediaKind>('movie')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<MediaItem[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)

  const [preview, setPreview] = useState<MediaDetails | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [season, setSeason] = useState(1)
  const [episode, setEpisode] = useState(1)
  const [episodes, setEpisodes] = useState<MediaEpisode[]>([])
  const [playing, setPlaying] = useState<{ item: MediaDetails; season: number; episode: number } | null>(null)

  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    setBusy(true)
    const needle = query.trim()
    const timer = window.setTimeout(
      () => {
        const load = needle ? searchCatalog(kind, needle) : loadCatalog(kind, 1)
        load
          .then((list) => {
            if (!alive) return
            setItems(list)
            setPage(1)
            setHasMore(!needle && list.length > 0)
            setStatus(list.length ? 'ready' : 'empty')
          })
          .catch(() => {
            if (!alive) return
            setItems([])
            setStatus('error')
          })
          .finally(() => {
            if (alive) setBusy(false)
          })
      },
      needle ? 320 : 0,
    )
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [kind, query])

  useEffect(() => {
    if (query.trim() || !hasMore || busy) return
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        setBusy(true)
        loadCatalog(kind, page + 1)
          .then((next) => {
            setItems((current) => [...current, ...next.filter((item) => !current.some((seen) => seen.id === item.id))])
            setPage((current) => current + 1)
            if (!next.length) setHasMore(false)
          })
          .catch(() => setHasMore(false))
          .finally(() => setBusy(false))
      },
      { rootMargin: '600px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [kind, page, hasMore, busy, query])

  function openPreview(item: MediaItem) {
    setPreviewBusy(true)
    setSeason(1)
    setEpisode(1)
    setEpisodes([])
    setPreview({ ...item, cert: '', runtime: '', seasons: [] })
    loadDetails(item)
      .then((details) => {
        setPreview(details)
        const first = details.seasons[0]?.number
        if (first) setSeason(first)
      })
      .catch(() => setPreview({ ...item, cert: 'NR', runtime: '', seasons: [] }))
      .finally(() => setPreviewBusy(false))
  }

  useEffect(() => {
    if (!preview || preview.kind === 'movie' || !preview.seasons.length) return
    let alive = true
    setEpisodes([])
    loadEpisodes(preview.id, season)
      .then((list) => {
        if (!alive) return
        setEpisodes(list)
        setEpisode(1)
      })
      .catch(() => {
        if (alive) setEpisodes([])
      })
    return () => {
      alive = false
    }
  }, [preview?.id, preview?.kind, season, preview?.seasons.length])

  useEffect(() => {
    if (!preview) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreview(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [preview])

  const adult = useMemo(() => (preview ? isAdultCert(preview.cert) : false), [preview])
  const countLabel = query.trim() ? `${items.length} results` : `${items.length} titles`

  return (
    <div className="media-page">
      <div className="media-page__scroll">
        <header className="media-page__head">
          <h1 className="media-page__title" key={kind}>
            {KIND_WORD[kind]}
          </h1>

          <div className="media-page__tabs-shell">
            <GlassSurface
              className="media-page__tabs-glass"
              width="100%"
              height="100%"
              borderRadius={999}
              backgroundOpacity={0.08}
              saturation={1.25}
              displace={0.4}
            >
              <div className="media-page__tabs" role="tablist" aria-label="Media sections">
                {SECTIONS.map((section) => (
                  <button
                    key={section.kind}
                    type="button"
                    role="tab"
                    aria-selected={kind === section.kind}
                    className={`media-page__tab${kind === section.kind ? ' is-active' : ''}`}
                    onClick={() => setKind(section.kind)}
                  >
                    {kind === section.kind && <GlassHighlight radius={999} />}
                    <span className="media-page__tab-label">{section.label}</span>
                  </button>
                ))}
              </div>
            </GlassSurface>
          </div>

          <div className={`media-page__search${focused ? ' is-focused' : ''}`}>
            <BorderBeam className="media-page__search-beam" {...BEAM_PROPS} borderRadius={999} active={focused}>
              <GlassSurface
                className="media-page__search-glass"
                width="100%"
                height="100%"
                borderRadius={999}
                backgroundOpacity={0.1}
                saturation={1.2}
                displace={0.5}
              >
                <form className="media-page__search-inner" onSubmit={(event) => event.preventDefault()}>
                  <svg className="media-page__search-icon" viewBox="0 0 20 20" aria-hidden="true">
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
                    className="media-page__search-input"
                    type="search"
                    value={query}
                    placeholder={SEARCH_HINT[kind]}
                    aria-label={SEARCH_HINT[kind]}
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

          <p className="media-page__meta">
            {status === 'loading' ? 'loading…' : status === 'error' ? 'unavailable' : countLabel}
          </p>
        </header>

        {status === 'error' ? (
          <p className="media-page__note">The catalog could not be reached. Try again in a moment.</p>
        ) : status === 'empty' ? (
          <p className="media-page__note">
            {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Nothing to show here yet.'}
          </p>
        ) : (
          <div className="media-page__grid">
            {items.map((item) => (
              <MediaCard key={`${item.kind}-${item.id}`} item={item} onOpen={() => openPreview(item)} />
            ))}
            {status === 'loading' &&
              Array.from({ length: 10 }, (_, index) => <span key={`skeleton-${index}`} className="media-page__skeleton" />)}
          </div>
        )}

        {!query.trim() && hasMore && <div className="media-page__sentinel" ref={sentinelRef} />}
      </div>

      {preview && (
        <div
          className="media-page__preview"
          role="dialog"
          aria-modal="true"
          aria-label={preview.name}
          onClick={(event) => {
            if (event.target === event.currentTarget) setPreview(null)
          }}
        >
          <div className="media-page__preview-shell">
            <GlassSurface
              className="media-page__preview-glass"
              width="100%"
              height="100%"
              borderRadius={18}
              backgroundOpacity={0.16}
              saturation={1.3}
              displace={0.5}
            >
            <div className="media-page__preview-body">
              <button
                type="button"
                className="media-page__preview-close"
                onClick={() => setPreview(null)}
                aria-label="Close preview"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>

              <div className="media-page__preview-media">
                {posterUrl(preview) ? (
                  <img className="media-page__poster" src={posterUrl(preview) ?? ''} alt="" />
                ) : (
                  <span className="media-page__poster media-page__poster--empty" />
                )}
              </div>

              <div className="media-page__preview-info">
                <h2 className="media-page__preview-title">{preview.name}</h2>
                <div className="media-page__chips">
                  <span className="media-page__chip">{KIND_LABEL[preview.kind]}</span>
                  {preview.year && preview.year !== 'N/A' && <span className="media-page__chip">{preview.year}</span>}
                  {preview.runtime && <span className="media-page__chip">{preview.runtime}</span>}
                  {preview.rating !== 'N/A' && (
                    <span className="media-page__chip media-page__chip--rating">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 4l2.4 5 5.6.8-4 3.9.9 5.4L12 16.6 7.1 19.1l.9-5.4-4-3.9 5.6-.8z" />
                      </svg>
                      {preview.rating}
                    </span>
                  )}
                  {preview.cert && preview.cert !== 'NR' && (
                    <span className={`media-page__chip${adult ? ' media-page__chip--adult' : ''}`}>{preview.cert}</span>
                  )}
                </div>

                <p className="media-page__overview">{preview.overview || 'No description available yet.'}</p>

                {preview.kind !== 'movie' && preview.seasons.length > 0 && (
                  <div className="media-page__pickers">
                    <label className="media-page__picker">
                      <span>Season</span>
                      <select value={season} onChange={(event) => setSeason(Number(event.target.value))}>
                        {preview.seasons.map((option) => (
                          <option key={option.number} value={option.number}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="media-page__picker">
                      <span>Episode</span>
                      <select value={episode} onChange={(event) => setEpisode(Number(event.target.value))}>
                        {(episodes.length ? episodes : Array.from({ length: 1 }, (_, index) => ({ number: index + 1, name: 'Episode 1' }))).map(
                          (option) => (
                            <option key={option.number} value={option.number}>
                              {`E${option.number} · ${option.name}`}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                )}

                <div className="media-page__actions">
                  <button
                    type="button"
                    className="media-page__watch"
                    onClick={() => {
                      void document.documentElement.requestFullscreen?.().catch(() => {})
                      setPlaying({ item: preview, season, episode })
                      setPreview(null)
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 5.5l10 6.5-10 6.5z" />
                    </svg>
                    Watch now
                  </button>
                  {previewBusy && <span className="media-page__hint">Loading details…</span>}
                </div>
              </div>
              </div>
            </GlassSurface>
          </div>
        </div>
      )}

      {playing && (
        <MediaPlayer
          item={playing.item}
          season={playing.season}
          episode={playing.episode}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  )
}

function MediaCard({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  const [broken, setBroken] = useState(false)
  const src = posterUrl(item)

  return (
    <button type="button" className="media-page__card" onClick={onOpen}>
      {src && !broken ? (
        <img
          className="media-page__card-image"
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="media-page__card-image media-page__card-image--empty" />
      )}
      <span className="media-page__badge">{item.rating}</span>
      <span className="media-page__card-name">{item.name}</span>
    </button>
  )
}

function MediaPlayer({
  item,
  season,
  episode,
  onClose,
}: {
  item: MediaDetails
  season: number
  episode: number
  onClose: () => void
}) {
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [onClose])

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void shellRef.current?.requestFullscreen?.().catch(() => {})
  }

  return createPortal(
    <div className="media-player" ref={shellRef}>
      <iframe
        className="media-player__frame"
        src={vidcoreUrl(item, season, episode)}
        title={item.name}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
      />
      <div className="media-player__dock" role="toolbar" aria-label="Player controls">
        <GlassSurface
          className="media-player__glass"
          width="100%"
          height="100%"
          borderRadius={999}
          backgroundOpacity={0.12}
          saturation={1.25}
          displace={0.45}
        >
          <div className="media-player__dock-inner">
            <button type="button" className="media-player__back" onClick={onClose} title="Back to media">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
              Media
            </button>
            <span className="media-player__divider" />
            <div className="media-player__identity">
              <span className="media-player__name">{item.name}</span>
              <span className="media-player__sub">{item.kind === 'movie' ? item.year : `S${season} · E${episode}`}</span>
            </div>
            <span className="media-player__divider" />
            <button type="button" className="media-player__fullscreen" title="Fullscreen" onClick={toggleFullscreen}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5" />
              </svg>
            </button>
          </div>
        </GlassSurface>
      </div>
    </div>,
    document.body,
  )
}
