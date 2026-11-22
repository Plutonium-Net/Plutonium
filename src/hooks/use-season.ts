import { useSyncExternalStore } from 'react'
import { getSeasonal, subscribeSeasonal } from '@/lib/season'

export function useSeasonal() {
  return useSyncExternalStore(subscribeSeasonal, getSeasonal, getSeasonal)
}
