import { useAccent } from '@/hooks/use-accent'
import Topography from './Topography'
import './topography-background.css'

/** Topography worn as a wallpaper: full-bleed, with no pointer work of its own. */
export default function TopographyBackground() {
  const accent = useAccent()

  return (
    <div className="topography-background">
      <Topography
        color={accent.hex}
        lineCount={26}
        lineWidth={1.2}
        elevation={1}
        foreground={0.2}
        tilt={24}
        speed={0.25}
        direction="forward"
        glow={1}
        depthOfField={0.7}
        fog={0.35}
        hoverEffect="light"
        clickEffect="pulse"
        markers="dots"
        glitch={0.35}
        mouseInteraction={false}
      />
    </div>
  )
}
