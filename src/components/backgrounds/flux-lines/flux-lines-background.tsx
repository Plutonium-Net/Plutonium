import { useAccent } from '@/hooks/use-accent'
import FluxLines from './FluxLines'
import './flux-lines-background.css'

export default function FluxLinesBackground() {
  const accent = useAccent()

  return (
    <div className="flux-lines-background">
      <FluxLines
        colors={[accent.hex, accent.hex, accent.hex]}
        glow={1.6}
        rimWidth={0.2}
        lineWidth={1}
        flowDirection="down"
        mouseInteraction={false}
        clickSwirl
        speed={0.25}
        turbulence={0.6}
        shimmer={1}
      />
    </div>
  )
}
