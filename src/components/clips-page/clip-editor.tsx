import { useEffect, useRef, useState } from 'react'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import { addClip, deleteClip, getClipBlob, updateClip, type ClipMeta } from '@/lib/clips/db'
import { formatBytes, formatDate, formatDuration, formatPrecise } from '@/lib/clips/format'
import { downloadClip, makeThumbnail, trimClip } from '@/lib/clips/media'

type ClipEditorProps = {
  clip: ClipMeta
  onClose: () => void
  onChanged: () => void
}

export default function ClipEditor({ clip, onClose, onChanged }: ClipEditorProps) {
  const [source, setSource] = useState<Blob | null>(null)
  const [blobUrl, setBlobUrl] = useState('')
  const [title, setTitle] = useState(clip.title)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(Math.max(0.5, clip.duration / 1000))
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [playingSelection, setPlayingSelection] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let alive = true
    let url = ''
    getClipBlob(clip.id)
      .then((blob) => {
        if (!alive || !blob) return
        url = URL.createObjectURL(blob)
        setSource(blob)
        setBlobUrl(url)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [clip.id])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !exporting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [exporting, onClose])

  useEffect(() => {
    if (!confirming) return
    const timer = window.setTimeout(() => setConfirming(false), 4000)
    return () => window.clearTimeout(timer)
  }, [confirming])

  const durationSec = Math.max(0.5, clip.duration / 1000)
  const selectionSec = Math.max(0, end - start)

  async function commitTitle() {
    const clean = title.trim() || 'Untitled clip'
    if (clean === title) return
    setTitle(clean)
    if (clean === clip.title) return
    await updateClip(clip.id, { title: clean }).catch(() => setMessage('The title could not be saved.'))
    onChanged()
  }

  async function toggleFavorite() {
    try {
      await updateClip(clip.id, { favorite: !clip.favorite })
      onChanged()
    } catch {
      setMessage('The favorite could not be saved.')
    }
  }

  function previewSelection() {
    const video = videoRef.current
    if (!video) return
    setPlayingSelection(true)
    try {
      video.currentTime = start
    } catch {
      // Seeking is optional; playback still previews the selection.
    }
    void video.play().catch(() => setPlayingSelection(false))
  }

  function handleTimeUpdate() {
    const video = videoRef.current
    if (!video || !playingSelection) return
    if (video.currentTime >= end - 0.03) {
      video.pause()
      setPlayingSelection(false)
    }
  }

  async function saveTrim() {
    if (!source || exporting) return
    setExporting(true)
    setProgress(0)
    setMessage('')
    try {
      const trimmed = await trimClip(source, start, end, setProgress)
      const thumb = (await makeThumbnail(trimmed.blob)) || clip.thumb
      await addClip(
        {
          ...clip,
          id: crypto.randomUUID(),
          title: `${title.trim() || clip.title} (trim)`,
          createdAt: Date.now(),
          duration: Math.round(trimmed.duration),
          width: trimmed.width || clip.width,
          height: trimmed.height || clip.height,
          size: trimmed.blob.size,
          mime: trimmed.mime,
          thumb,
          favorite: false,
        },
        trimmed.blob,
      )
      setMessage('Trimmed clip saved to your library.')
      onChanged()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'The trimmed clip could not be saved.')
    } finally {
      setExporting(false)
    }
  }

  async function remove() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    try {
      await deleteClip(clip.id)
      onChanged()
      onClose()
    } catch {
      setMessage('The clip could not be deleted.')
      setConfirming(false)
    }
  }

  return (
    <div
      className="clip-studio"
      role="dialog"
      aria-modal="true"
      aria-label={`Clip studio: ${title}`}
      onClick={(event) => {
        if (event.target === event.currentTarget && !exporting) onClose()
      }}
    >
      <div className="clip-studio__shell">
        <header className="clip-studio__head">
          <div className="clip-studio__heading">
            <span className="clip-studio__eyebrow">Clip studio</span>
            <input
              className="clip-studio__title"
              value={title}
              maxLength={90}
              aria-label="Clip title"
              spellCheck={false}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
          </div>

          <div className="clip-studio__head-actions">
            <button
              type="button"
              className={`clip-studio__icon-btn${clip.favorite ? ' is-on' : ''}`}
              onClick={() => void toggleFavorite()}
              aria-pressed={clip.favorite}
              aria-label={clip.favorite ? 'Remove from favorites' : 'Add to favorites'}
              title={clip.favorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
              </svg>
            </button>
            <span className="clip-studio__local">On this device</span>
            <button type="button" className="clip-studio__icon-btn clip-studio__close" onClick={onClose} aria-label="Close studio">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
              </svg>
            </button>
          </div>
        </header>

        <div className="clip-studio__body">
          <div className="clip-studio__viewer">
            <div className="clip-studio__stage">
              {blobUrl ? (
                <video
                  ref={videoRef}
                  className="clip-studio__video"
                  src={blobUrl}
                  controls
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                />
              ) : (
                <span className="clip-studio__loading">{failed ? 'This clip is unavailable.' : 'Loading clip…'}</span>
              )}
            </div>

            <dl className="clip-studio__facts">
              <div className="clip-studio__fact">
                <dt>Duration</dt>
                <dd>{formatDuration(clip.duration)}</dd>
              </div>
              <div className="clip-studio__fact">
                <dt>Resolution</dt>
                <dd>{clip.width && clip.height ? `${clip.width}×${clip.height}` : '-'}</dd>
              </div>
              <div className="clip-studio__fact">
                <dt>Size</dt>
                <dd>{formatBytes(clip.size)}</dd>
              </div>
              <div className="clip-studio__fact">
                <dt>Recorded</dt>
                <dd>{formatDate(clip.createdAt)}</dd>
              </div>
            </dl>
          </div>

          <aside className="clip-studio__panel">
            <section className="clip-studio__card">
              <GlassSurface
                className="clip-studio__card-glass"
                width="100%"
                height="100%"
                borderRadius={14}
                backgroundOpacity={0.08}
                saturation={1.15}
                displace={0.6}
              />

              <div className="clip-studio__card-head">
                <h2 className="clip-studio__section-title">Trim</h2>
                <span className="clip-studio__selection">
                  {exporting ? `Saving ${Math.round(progress * 100)}%` : `${formatPrecise(selectionSec)} selected`}
                </span>
              </div>

              <div className="clip-studio__range">
                <label htmlFor="clip-trim-start">
                  Start <output htmlFor="clip-trim-start">{formatPrecise(start)}</output>
                </label>
                <input
                  id="clip-trim-start"
                  type="range"
                  min={0}
                  max={durationSec}
                  step={0.1}
                  value={start}
                  onChange={(event) => setStart(Math.min(Number(event.target.value), end - 0.5))}
                />
              </div>

              <div className="clip-studio__range">
                <label htmlFor="clip-trim-end">
                  End <output htmlFor="clip-trim-end">{formatPrecise(end)}</output>
                </label>
                <input
                  id="clip-trim-end"
                  type="range"
                  min={0}
                  max={durationSec}
                  step={0.1}
                  value={end}
                  onChange={(event) => setEnd(Math.max(Number(event.target.value), start + 0.5))}
                />
              </div>

              {exporting && (
                <div className="clip-studio__progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
                  <span style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              )}

              <div className="clip-studio__buttons">
                <button
                  type="button"
                  className="clip-studio__btn"
                  onClick={previewSelection}
                  disabled={!blobUrl || exporting}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8.5 5.9v12.2l9.5-6.1z" />
                  </svg>
                  Preview
                </button>
                <button
                  type="button"
                  className="clip-studio__btn clip-studio__btn--primary"
                  onClick={() => void saveTrim()}
                  disabled={!source || exporting}
                >
                  {exporting ? 'Saving…' : 'Save as new clip'}
                </button>
              </div>
            </section>

            <section className="clip-studio__actions">
              <button
                type="button"
                className="clip-studio__btn"
                onClick={() => source && downloadClip({ ...clip, title: title.trim() || clip.title }, source)}
                disabled={!source}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />
                </svg>
                Download
              </button>
              <button type="button" className="clip-studio__btn clip-studio__btn--danger" onClick={() => void remove()}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 7h14M10 7V5h4v2M8 7l.7 12h6.6L16 7" />
                </svg>
                {confirming ? 'Confirm delete' : 'Delete'}
              </button>
            </section>

            <p className={`clip-studio__note${failed ? ' is-error' : ''}`}>
              {message || 'Trims are saved as a new clip. Nothing is uploaded - clips live in this browser.'}
            </p>
          </aside>
        </div>
      </div>
    </div>
  )
}
