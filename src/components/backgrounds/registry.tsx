import type { ComponentType } from 'react'
import ImageBackground from './image-background/image-background'
import SoftAuroraBackground from './soft-aurora/soft-aurora-background'

export type BackgroundOption = {
  id: string
  name: string
  Component: ComponentType
}

/** Wraps a scene image as a background component. `dim` is the % of black over it. */
function scene(src: string, dim: number) {
  return function SceneBackground() {
    return <ImageBackground src={src} dim={dim} />
  }
}

export const BACKGROUNDS: BackgroundOption[] = [
  { id: 'soft-aurora', name: 'Soft Aurora', Component: SoftAuroraBackground },
  { id: 'scene-sakura', name: 'Sakura', Component: scene('/img/presets/sakura.jpg', 35) },
  { id: 'scene-autumn', name: 'Autumn', Component: scene('/img/presets/autumn.jpg', 30) },
  { id: 'scene-late-autumn', name: 'Late Autumn', Component: scene('/img/presets/late-autumn.jpg', 25) },
  { id: 'scene-winter', name: 'Snowstorm', Component: scene('/img/presets/winter.jpg', 30) },
  { id: 'scene-marin-kitagawa', name: 'Marin Kitagawa', Component: scene('/img/presets/marin-kitagawa.jpg', 10) },
  { id: 'scene-orbital', name: 'Orbital', Component: scene('/img/presets/orbital.jpg', 25) },
]

const DAY_MS = 86_400_000

export function backgroundFor(date = new Date()): BackgroundOption {
  const local = date.getTime() - date.getTimezoneOffset() * 60_000
  const day = Math.floor(local / DAY_MS)
  return BACKGROUNDS[((day % BACKGROUNDS.length) + BACKGROUNDS.length) % BACKGROUNDS.length]
}
