import { useAccent } from '@/hooks/use-accent'
import SoftAurora from './SoftAurora'
import './soft-aurora-background.css'

/** SoftAurora worn as a wallpaper: full-bleed, with the cursor drift switched off. */
export default function SoftAuroraBackground() {
  const accent = useAccent()

  return (
    <div className="soft-aurora-background">
      <SoftAurora
        speed={0.6}
        scale={1.5}
        brightness={0.7}
        saturation={1.6}
        color1={accent.hex}
        color2={accent.hex}
        bandHeight={0.5}
        bandSpread={0.75}
        enableMouseInteraction={false}
        mouseInfluence={0.25}
      />
    </div>
  )
}
