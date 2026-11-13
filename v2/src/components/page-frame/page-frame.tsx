import { useEffect, useState } from 'react'
import type { Tab } from '@/hooks/use-tabs'
import { encodeUrl, type EngineId } from '@/lib/net/engines'
import './page-frame.css'

type PageFrameProps = {
  tab: Tab
  engine: EngineId
  region: string
  reloadToken: number
}

export default function PageFrame({ tab, engine, region, reloadToken }: PageFrameProps) {
  const [loading, setLoading] = useState(true)
  const src = engine === 'remote' ? (tab.frameUrl || tab.url) : encodeUrl(engine, tab.url, region)

  useEffect(() => {
    setLoading(true)
  }, [src, reloadToken])

  return (
    <div className="page-frame">
      <iframe
        key={`${src}-${reloadToken}`}
        className="page-frame__frame"
        src={src}
        title={tab.title}
        onLoad={() => setLoading(false)}
        allow="fullscreen; clipboard-read; clipboard-write; autoplay"
      />
      {loading && <div className="page-frame__loading">Loading {tab.title}…</div>}
    </div>
  )
}
