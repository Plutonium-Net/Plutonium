import { useEffect, useSyncExternalStore } from 'react'
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
      <span>{notice.text}</span>
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
