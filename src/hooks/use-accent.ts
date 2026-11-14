import { useSyncExternalStore } from 'react'
import { getAccent, subscribeAccent } from '@/lib/accent'

export function useAccent() {
  return useSyncExternalStore(subscribeAccent, getAccent, getAccent)
}
