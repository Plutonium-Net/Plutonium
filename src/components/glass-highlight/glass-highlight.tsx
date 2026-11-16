import GlassSurface from '@/components/glass-surface/GlassSurface'
import './glass-highlight.css'

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
