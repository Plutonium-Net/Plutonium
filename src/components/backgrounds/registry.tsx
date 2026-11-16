import type { ComponentType } from 'react'
import DotBackgroundDemo from '@/components/dot-background-demo'
import FluxLinesBackground from './flux-lines/flux-lines-background'
import SoftAuroraBackground from './soft-aurora/soft-aurora-background'
import ThreadsBackground from './threads/threads-background'
import TopographyBackground from './topography/topography-background'

export type BackgroundOption = {
  id: string
  name: string
  Component: ComponentType
}

export const BACKGROUNDS: BackgroundOption[] = [
  { id: 'dots', name: 'Dots', Component: DotBackgroundDemo },
  { id: 'topography', name: 'Topography', Component: TopographyBackground },
  { id: 'threads', name: 'Threads', Component: ThreadsBackground },
  { id: 'soft-aurora', name: 'Soft Aurora', Component: SoftAuroraBackground },
  { id: 'flux-lines', name: 'Flux Lines', Component: FluxLinesBackground },
]

const DAY_MS = 86_400_000

export function backgroundFor(date = new Date()): BackgroundOption {
  const local = date.getTime() - date.getTimezoneOffset() * 60_000
  const day = Math.floor(local / DAY_MS)
  return BACKGROUNDS[((day % BACKGROUNDS.length) + BACKGROUNDS.length) % BACKGROUNDS.length]
}
