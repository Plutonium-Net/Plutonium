import GlassSurface from '@/components/glass-surface/GlassSurface'
import './glass-highlight.css'

/**
 * The active-row highlight: a glass chip behind the row's contents, lit the way
 * an active tab is (0.18 frost, 1.35 saturation) so the selection reads as glass
 * rather than a flat wash of white.
 */
export default function GlassHighlight({ radius = 9 }: { radius?: number }) {
  return (
    <GlassSurface
      className="glass-highlight"
      width="100%"
      height="100%"
      borderRadius={radius}
      backgroundOpacity={0.18}
      saturation={1.35}
      displace={0.4}
    />
  )
}
