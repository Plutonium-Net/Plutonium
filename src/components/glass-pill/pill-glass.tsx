import GlassSurface from '@/components/glass-surface/GlassSurface'
import './pill-glass.css'

export default function PillGlass({ radius = 999 }: { radius?: number }) {
  return (
    <span className="pill-glass" aria-hidden="true">
      <GlassSurface
        className="pill-glass__surface"
        width="100%"
        height="100%"
        borderRadius={radius}
        backgroundOpacity={0.1}
        saturation={1.2}
        displace={0.35}
      />
    </span>
  )
}
