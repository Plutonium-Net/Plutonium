import type { ComponentType } from 'react'
import DotBackgroundDemo from '@/components/dot-background-demo'
import TopographyBackground from './topography/topography-background'

/**
 * The wallpapers the app shell can wear. Each one paints itself full-screen
 * behind the home UI, so a new option only has to be listed here.
 */
export type BackgroundOption = {
  id: string
  name: string
  Component: ComponentType
}

export const BACKGROUNDS: BackgroundOption[] = [
  { id: 'dots', name: 'Dots', Component: DotBackgroundDemo },
  { id: 'topography', name: 'Topography', Component: TopographyBackground },
]

const DAY_MS = 86_400_000

/**
 * The wallpaper changes once a day on its own: the local date is folded into a
 * day number, so it holds steady from midnight to midnight instead of shuffling
 * on every reload. The offset keeps it on local days rather than UTC ones.
 */
export function backgroundFor(date = new Date()): BackgroundOption {
  const local = date.getTime() - date.getTimezoneOffset() * 60_000
  const day = Math.floor(local / DAY_MS)
  return BACKGROUNDS[((day % BACKGROUNDS.length) + BACKGROUNDS.length) % BACKGROUNDS.length]
}

export default function Background() {
  const { Component } = backgroundFor()
  return <Component />
}
