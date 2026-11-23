import { useCallback, useEffect, useMemo, useState } from 'react'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import { listClips, subscribeClips, updateClip, type ClipMeta } from '@/lib/clips/db'
import { formatBytes, formatDate, formatDuration } from '@/lib/clips/format'
import ClipExtensionNotice from '@/components/clip-button/clip-extension-notice'
import ClipEditor from './clip-editor'
import './clips-page.css'

type Sort = 'newest' | 'oldest' | 'longest'

export default function ClipsPage() {
  const [clips, setClips] = useState<ClipMeta[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const reload = useCallback(() => {
    listClips()
      .then((list) => {
        setClips(list)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [])

  useEffect(() => {
    reload()
    return subscribeClips(reload)
  }, [reload])

  useEffect(() => {
    if (selectedId && !clips.some((clip) => clip.id === selectedId)) setSelectedId(null)
  }, [clips, selectedId])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle ? clips.filter((clip) => clip.title.toLowerCase().includes(needle)) : clips
    return [...filtered].sort((a, b) => {
      if (sort === 'oldest') return a.createdAt - b.createdAt
      if (sort === 'longest') return b.duration - a.duration
      return b.createdAt - a.createdAt
    })
  }, [clips, query, sort])

  const totalBytes = useMemo(() => clips.reduce((sum, clip) => sum + clip.size, 0), [clips])
  const selected = clips.find((clip) => clip.id === selectedId) ?? null

  async function toggleFavorite(clip: ClipMeta) {
    try {
      await updateClip(clip.id, { favorite: !clip.favorite })
    } catch {
      setNotice('The favorite could not be saved.')
    }
  }

  return (
    <div className="clips-page">
      <div className="clips-page__scroll">
        <div className="clips-page__inner">
          <header className="clips-page__head">
            <h1 className="clips-page__title">Clips</h1>
            <p className="clips-page__sub">
              Press clip in a game or on a proxied tab to start recording, press it again to stop and save. Trim,
              favorite and download what you save - everything stays in this browser and is never uploaded.
            </p>
          </header>

          <ClipExtensionNotice />

          <GlassSurface
            className="clips-page__panel"
            width="100%"
            height="auto"
            borderRadius={20}
            backgroundOpacity={0.06}
            saturation={1.25}
            displace={0.7}
          >
            <div className="clips-page__panel-body">
              <div className="clips-page__bar">
                <span className="clips-page__count">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="2.8" y="4.8" width="18.4" height="14.4" rx="2.8" />
                    <path d="M7.7 4.8v14.4M16.3 4.8v14.4" />
                    <path d="M2.8 9.2h4.9M2.8 14.8h4.9M16.3 9.2h4.9M16.3 14.8h4.9" />
                  </svg>
                  {clips.length} clip{clips.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}
                </span>
                <span className="clips-page__grow" />
                <label className="clips-page__search">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="10.6" cy="10.6" r="6.4" />
                    <path d="m15.4 15.4 4.1 4.1" />
                  </svg>
                  <input
                    type="search"
                    value={query}
                    placeholder="Search clips"
                    aria-label="Search clips"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <span className="clips-page__sortwrap">
                  <select
                    className="clips-page__sort"
                    value={sort}
                    aria-label="Sort clips"
                    onChange={(event) => setSort(event.target.value as Sort)}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="longest">Longest first</option>
                  </select>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
                  </svg>
                </span>
              </div>

              {status === 'loading' ? (
                <p className="clips-page__note">Loading clips…</p>
              ) : status === 'error' ? (
                <div className="clips-page__empty">
                  <span className="clips-page__empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="8.4" />
                      <path d="m6.1 17.9 11.8-11.8" />
                    </svg>
                  </span>
                  <h2>Clip storage is unavailable</h2>
                  <p>Your browser blocked local storage. Clips cannot be read until it is allowed.</p>
                </div>
              ) : clips.length === 0 ? (
                <div className="clips-page__empty">
                  <span className="clips-page__empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="8.4" />
                      <circle className="clips-page__empty-dot" cx="12" cy="12" r="3.2" />
                    </svg>
                  </span>
                  <h2>No clips yet</h2>
                  <p>Captured clips will land here, ready to trim and download.</p>
                </div>
              ) : (
                <div className="clips-page__grid">
                  {visible.map((clip) => (
                    <article className="clip-card" key={clip.id}>
                      <button
                        type="button"
                        className="clip-card__open"
                        onClick={() => setSelectedId(clip.id)}
                        aria-label={`Open ${clip.title}`}
                      >
                        <span className="clip-card__thumb">
                          {clip.thumb ? (
                            <img src={clip.thumb} alt="" loading="lazy" draggable={false} />
                          ) : (
                            <span className="clip-card__thumb-empty" aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <rect x="2.8" y="6.4" width="12.2" height="11.2" rx="3" />
                                <path d="m15 12.3 5.1-3.1a.7.7 0 0 1 1.1.6v4.4a.7.7 0 0 1-1.1.6L15 12.3z" />
                              </svg>
                            </span>
                          )}
                          <span className="clip-card__play" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <path d="M9.2 6.6a1 1 0 0 1 1.5-.87l7.2 4.5a1.1 1.1 0 0 1 0 1.84l-7.2 4.5a1 1 0 0 1-1.5-.87z" />
                            </svg>
                          </span>
                          <span className="clip-card__duration">{formatDuration(clip.duration)}</span>
                        </span>
                        <span className="clip-card__body">
                          <span className="clip-card__title">{clip.title}</span>
                          <span className="clip-card__meta">
                            {formatDate(clip.createdAt)} · {formatBytes(clip.size)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`clip-card__fav${clip.favorite ? ' is-on' : ''}`}
                        onClick={() => void toggleFavorite(clip)}
                        aria-label={clip.favorite ? 'Remove from favorites' : 'Favorite clip'}
                        aria-pressed={clip.favorite}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 4.4l2.36 4.83 5.32.77-3.84 3.75.9 5.3L12 16.55l-4.74 2.5.9-5.3L4.32 10l5.32-.77z" />
                        </svg>
                      </button>
                    </article>
                  ))}
                </div>
              )}

              {status === 'ready' && clips.length > 0 && visible.length === 0 && (
                <p className="clips-page__note">Nothing matches “{query.trim()}”.</p>
              )}
            </div>
          </GlassSurface>
        </div>
      </div>

      {selected && (
        <ClipEditor key={selected.id} clip={selected} onClose={() => setSelectedId(null)} onChanged={reload} />
      )}

      {notice && (
        <div className="clips-page__toast" role="status" aria-live="polite">
          <GlassSurface
            className="clips-page__toast-glass"
            width="100%"
            height="100%"
            borderRadius={999}
            backgroundOpacity={0.16}
            saturation={1.3}
            displace={0.35}
          />
          <span className="clips-page__toast-text">{notice}</span>
        </div>
      )}
    </div>
  )
}
