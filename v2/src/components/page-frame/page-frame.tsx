import { useEffect, useRef, useState } from 'react'
import type { Tab } from '@/hooks/use-tabs'
import { encodeUrl, type EngineId } from '@/lib/net/engines'
import './page-frame.css'

type PageFrameProps = {
  tab?: Tab
  visible: boolean
  engine: EngineId
  region: string
  reloadToken: number
}

/**
 * One iframe for the whole app, always mounted.
 *
 * Scramjet V2's controller binds to this exact element when it boots (`createFrame`
 * looks up `#page-frame`), so it must never be remounted — no `key` on the node and
 * no conditional rendering. v1 keeps the same element hidden until it is needed,
 * and reloads by re-assigning `src` rather than by replacing the frame.
 */
export default function PageFrame({ tab, visible, engine, region, reloadToken }: PageFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(false)

  const src = tab && visible ? (engine === 'remote' ? tab.frameUrl || tab.url : encodeUrl(engine, tab.url, region)) : 'about:blank'

  useEffect(() => {
    setLoading(visible && !!tab)
  }, [src, visible, tab])

  useEffect(() => {
    if (!reloadToken || !visible) return
    const frame = frameRef.current
    if (!frame) return
    try {
      frame.contentWindow?.location.reload()
    } catch {
      frame.src = frame.src
    }
  }, [reloadToken, visible])

  return (
    <div className={`page-frame${visible ? '' : ' is-hidden'}`}>
      <iframe
        ref={frameRef}
        id="page-frame"
        className="page-frame__frame"
        src={src}
        title={tab?.title || 'Page'}
        onLoad={() => setLoading(false)}
        allow="fullscreen; clipboard-read; clipboard-write; autoplay"
      />
      {visible && loading && <div className="page-frame__loading">Loading {tab?.title}…</div>}
    </div>
  )
}
