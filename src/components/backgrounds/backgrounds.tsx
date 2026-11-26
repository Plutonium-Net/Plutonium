import { useSyncExternalStore } from 'react'
import { usePerformance } from '@/hooks/use-performance'
import FlatBackground from './flat-background'
import { DAILY, getBackgroundChoice, subscribeBackground } from './background-store'
import { BACKGROUNDS, backgroundFor, type BackgroundOption } from './registry'

export function useBackground(): BackgroundOption {
  const choice = useSyncExternalStore(subscribeBackground, getBackgroundChoice, getBackgroundChoice)
  if (choice === DAILY) return backgroundFor()
  return BACKGROUNDS.find((option) => option.id === choice) ?? backgroundFor()
}

export default function Background() {
  const { Component } = useBackground()
  const performance = usePerformance()
  if (performance.enabled && performance.features.flatBackground) return <FlatBackground />
  return <Component />
}
