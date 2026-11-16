import type { ReactNode } from 'react'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import './glass-panel.css'

export default function GlassPanel({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`glass-panel${className ? ` ${className}` : ''}`}>
      <GlassSurface
        className="glass-panel__surface"
        width="100%"
        height="100%"
        borderRadius={14}
        backgroundOpacity={0.1}
        saturation={1.2}
        displace={0.5}
      />
      <div className="glass-panel__body">{children}</div>
    </div>
  )
}
