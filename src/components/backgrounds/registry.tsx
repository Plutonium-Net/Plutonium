import type { ComponentType } from 'react'
import { useAccent } from '@/hooks/use-accent'
import ImageBackground from './image-background/image-background'
import SoftAurora from './soft-aurora/SoftAurora'
import SoftAuroraBackground from './soft-aurora/soft-aurora-background'

export type BackgroundOption = {
  id: string
  name: string
  /** CSS background for the panel thumbnail. Omitted when a live Preview handles it. */
  preview?: string
  /** Renders the real background inside the panel thumbnail instead of a still. */
  Preview?: ComponentType
  Component: ComponentType
}

function SoftAuroraPreview() {
  const accent = useAccent()

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true">
      <SoftAurora
        speed={0}
        scale={1.5}
        brightness={0.8}
        saturation={1.5}
        color1={accent.hex}
        color2={accent.hex}
        bandHeight={0.55}
        bandSpread={0.8}
        enableMouseInteraction={false}
        clickPulse={false}
        intro={false}
      />
    </div>
  )
}

function imageOption(id: string, name: string, src: string, dim: number): BackgroundOption {
  return {
    id,
    name,
    preview: `url("${src}")`,
    Component: function SceneBackground() {
      return <ImageBackground src={src} dim={dim} />
    },
  }
}

export const BACKGROUNDS: BackgroundOption[] = [
  { id: 'soft-aurora', name: 'Soft Aurora', Preview: SoftAuroraPreview, Component: SoftAuroraBackground },
  imageOption('scene-sakura', 'Sakura', '/img/presets/sakura.jpg', 35),
  imageOption('scene-autumn', 'Autumn', '/img/presets/autumn.jpg', 30),
  imageOption('scene-late-autumn', 'Late Autumn', '/img/presets/late-autumn.jpg', 25),
  imageOption('scene-halloween', 'Halloween', '/img/presets/halloween.jpg', 30),
  imageOption('scene-thanksgiving', 'Thanksgiving', '/img/presets/thanksgiving.jpg', 28),
  imageOption('scene-winter-village', 'Winter', '/img/presets/winter-village.jpg', 26),
  imageOption('scene-winter', 'Snowstorm', '/img/presets/winter.jpg', 30),
  imageOption('scene-marin-kitagawa', 'Marin Kitagawa', '/img/presets/marin-kitagawa.png', 10),
  imageOption('scene-orbital', 'Orbital', '/img/presets/orbital.jpg', 25),
]

const DAY_MS = 86_400_000

export function backgroundFor(date = new Date()): BackgroundOption {
  const local = date.getTime() - date.getTimezoneOffset() * 60_000
  const day = Math.floor(local / DAY_MS)
  return BACKGROUNDS[((day % BACKGROUNDS.length) + BACKGROUNDS.length) % BACKGROUNDS.length]
}
