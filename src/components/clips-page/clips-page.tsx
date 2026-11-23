import { useCallback, useEffect, useMemo, useState } from 'react'
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
            <div>
              <span className="clips-page__kicker">Plutonium Studio</span>
              <h1 className="clips-page__title">Clips</h1>
              <p className="clips-page__sub">
                Press clip in a game or on a proxied tab to start recording, press it again to stop and save. Trim,
                favorite and download what you save — everything stays in this browser and is never uploaded.
              </p>
            </div>
          </header>

          <ClipExtensionNotice />

          <div className="clips-page__bar">
            <span className="clips-page__count">
              {clips.length} clip{clips.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}
            </span>
            <span className="clips-page__grow" />
            <label className="clips-page__search">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="9" cy="9" r="6" />
                <path d="m13.4 13.4 3.6 3.6" />
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
          </div>

          {status === 'loading' ? (
            <p className="clips-page__note">Loading clips…</p>
          ) : status === 'error' ? (
            <div className="clips-page__empty">
              <h2>Clip storage is unavailable</h2>
              <p>Your browser blocked local storage. Clips cannot be read until it is allowed.</p>
            </div>
          ) : clips.length === 0 ? (
            <div className="clips-page__empty">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="M7.5 5v14M16.5 5v14M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21" />
              </svg>
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
                            <rect x="3" y="6" width="12.5" height="12" rx="3" />
                            <path d="m15.5 12.5 5.5-3.3v7.6l-5.5-3.3z" />
                          </svg>
                        </span>
                      )}
                      <span className="clip-card__play" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                          <path d="M8 5.5l11 6.5-11 6.5z" />
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
                      <path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 10.2l5.4-.8z" />
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
      </div>

      {selected && (
        <ClipEditor key={selected.id} clip={selected} onClose={() => setSelectedId(null)} onChanged={reload} />
      )}

      {notice && (
        <div className="clips-page__toast" role="status" aria-live="polite">
          {notice}
        </div>
      )}
    </div>
  )
}
