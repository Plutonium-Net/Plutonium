import type { ReactNode } from 'react'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import './glass-panel.css'

type GlassPanelProps = {
  className?: string
  tint?: boolean
  children: ReactNode
}

export default function GlassPanel({ className = '', tint = false, children }: GlassPanelProps) {
  return (
    <div className={`glass-panel${tint ? ' glass-panel--tint' : ''}${className ? ` ${className}` : ''}`}>
      <GlassSurface
        className="glass-panel__surface"
        width="100%"
        height="100%"
        borderRadius={14}
        backgroundOpacity={0.1}
        saturation={1.2}
        displace={0.5}
      />
      {tint && <span className="glass-panel__tint" aria-hidden="true" />}
      <div className="glass-panel__body">{children}</div>
    </div>
  )
}
