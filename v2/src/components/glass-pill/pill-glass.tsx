import GlassSurface from '@/components/glass-surface/GlassSurface'
import './pill-glass.css'

/**
 * A real-glass backing for an existing pill or round button. It sits at
 * `z-index: -1` inside the control's own stacking context, so the control keeps
 * its text, icons and shadow while the surface behind them is actual glass.
 */
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
