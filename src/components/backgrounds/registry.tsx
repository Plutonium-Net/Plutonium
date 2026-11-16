import type { ComponentType } from 'react'
import SoftAuroraBackground from './soft-aurora/soft-aurora-background'

export type BackgroundOption = {
  id: string
  name: string
  Component: ComponentType
}

export const BACKGROUNDS: BackgroundOption[] = [
  { id: 'soft-aurora', name: 'Soft Aurora', Component: SoftAuroraBackground },
]

const DAY_MS = 86_400_000

export function backgroundFor(date = new Date()): BackgroundOption {
  const local = date.getTime() - date.getTimezoneOffset() * 60_000
  const day = Math.floor(local / DAY_MS)
  return BACKGROUNDS[((day % BACKGROUNDS.length) + BACKGROUNDS.length) % BACKGROUNDS.length]
}
