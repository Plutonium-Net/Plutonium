import { useSyncExternalStore } from 'react'
import { DAILY, getBackgroundChoice, subscribeBackground } from './background-store'
import { BACKGROUNDS, backgroundFor, type BackgroundOption } from './registry'

/** The wallpaper the shell is wearing: the daily one unless the user picked. */
export function useBackground(): BackgroundOption {
  const choice = useSyncExternalStore(subscribeBackground, getBackgroundChoice, getBackgroundChoice)
  if (choice === DAILY) return backgroundFor()
  return BACKGROUNDS.find((option) => option.id === choice) ?? backgroundFor()
}

export default function Background() {
  const { Component } = useBackground()
  return <Component />
}
