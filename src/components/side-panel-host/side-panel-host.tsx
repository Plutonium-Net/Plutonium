import { useEffect, useRef, useState, type ReactNode } from 'react'
import './side-panel-host.css'

export type SidePanelId = 'history' | 'proxy' | 'region' | 'customize' | 'info'

const EXIT_MS = 170

type SidePanelHostProps = {
  panel: SidePanelId | null
  children: (panel: SidePanelId) => ReactNode
}

export default function SidePanelHost({ panel, children }: SidePanelHostProps) {
  const [shown, setShown] = useState<SidePanelId | null>(panel)
  const [closing, setClosing] = useState(false)
  const [seq, setSeq] = useState(0)
  const shownRef = useRef<SidePanelId | null>(panel)

  useEffect(() => {
    const previous = shownRef.current

    if (panel === null) {
      if (previous === null) return
      setClosing(true)
      const timer = window.setTimeout(() => {
        shownRef.current = null
        setShown(null)
        setClosing(false)
      }, EXIT_MS)
      return () => window.clearTimeout(timer)
    }

    if (previous === panel) {
      setClosing(false)
      return
    }

    shownRef.current = panel
    setShown(panel)
    setClosing(false)
    setSeq((value) => value + 1)
  }, [panel])

  if (!shown) return null

  return (
    <div key={`${shown}-${seq}`} className={`side-panel-host${closing ? ' is-closing' : ' is-open'}`}>
      {children(shown)}
    </div>
  )
}
