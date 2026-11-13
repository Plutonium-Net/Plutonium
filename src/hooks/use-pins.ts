import { useSyncExternalStore } from 'react'
import { getPins, subscribePins } from '@/lib/pins'

export function usePins() {
  return useSyncExternalStore(subscribePins, getPins, getPins)
}
