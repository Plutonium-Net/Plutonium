import { useSyncExternalStore } from 'react'
import { getHistory, subscribeHistory } from '@/lib/history'

export function useHistory() {
  return useSyncExternalStore(subscribeHistory, getHistory, getHistory)
}
