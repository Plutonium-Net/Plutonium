import { useEffect, useSyncExternalStore } from 'react'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import {
  dismissClipNotice,
  getClipNotice,
  subscribeClipNotice,
} from '@/lib/clips/capture'
import './clip-button.css'

export default function ClipToaster() {
  const notice = useSyncExternalStore(subscribeClipNotice, getClipNotice)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(dismissClipNotice, notice.tone === 'error' ? 14000 : 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  if (!notice) return null

  return (
    <div className={`clip-toast${notice.tone === 'error' ? ' is-error' : ''}`} role="status" aria-live="polite">
      <GlassSurface
        className="clip-toast__glass"
        width="100%"
        height="100%"
        borderRadius={14}
        backgroundOpacity={0.16}
        saturation={1.3}
        displace={0.35}
      />
      <span className="clip-toast__text">{notice.text}</span>
      {notice.studio && (
        <button
          type="button"
          onClick={() => {
            dismissClipNotice()
            window.dispatchEvent(new CustomEvent('plu:navigate', { detail: 'pluto://clips' }))
          }}
        >
          Open studio
        </button>
      )}
    </div>
  )
}
