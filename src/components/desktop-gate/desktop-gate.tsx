import { useEffect, useState } from 'react'
import GlassPanel from '@/components/glass-panel/glass-panel'
import './desktop-gate.css'


const WIDE = '(min-width: 900px)'
const FINE = '(hover: hover) and (pointer: fine)'

function isDesktop() {
  if (typeof window === 'undefined' || !window.matchMedia) return true
  return window.matchMedia(WIDE).matches && window.matchMedia(FINE).matches
}

export default function DesktopGate() {
  const [desktop, setDesktop] = useState(isDesktop)

  useEffect(() => {
    const wide = window.matchMedia(WIDE)
    const fine = window.matchMedia(FINE)
    const update = () => setDesktop(wide.matches && fine.matches)

    update()
    wide.addEventListener('change', update)
    fine.addEventListener('change', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)

    return () => {
      wide.removeEventListener('change', update)
      fine.removeEventListener('change', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  if (desktop) return null

  return (
    <div className="desktop-gate" role="alertdialog" aria-modal="true" aria-labelledby="desktop-gate-title">
      <GlassPanel className="desktop-gate__card">
        <div className="desktop-gate__body">
          <span className="desktop-gate__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
              <path d="M8.5 20.5h7M12 16.5v4" />
            </svg>
          </span>
          <h1 className="desktop-gate__title" id="desktop-gate-title">
            Desktop only for now
          </h1>
          <p className="desktop-gate__text">Plutonium only supports desktop mode for now.</p>
          <p className="desktop-gate__hint">Open it on a computer with a keyboard and a mouse to keep browsing.</p>
        </div>
      </GlassPanel>
    </div>
  )
}
