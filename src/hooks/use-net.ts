import { useSyncExternalStore } from 'react'
import { ensureConnected, getNet, probeRegions, setEngine, setRegion, subscribeNet } from '@/lib/net/net-store'

export function useNet() {
  const net = useSyncExternalStore(subscribeNet, getNet, getNet)
  return {
    ...net,
    setEngine,
    setRegion,
    probeRegions,
    ensureConnected,
  }
}
