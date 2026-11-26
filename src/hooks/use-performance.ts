import { useSyncExternalStore } from 'react'
import { getPerformance, isSimpleGlass, subscribePerformance } from '@/lib/performance'

export function usePerformance() {
  return useSyncExternalStore(subscribePerformance, getPerformance, getPerformance)
}

export function useSimpleGlass() {
  return useSyncExternalStore(subscribePerformance, isSimpleGlass, isSimpleGlass)
}
