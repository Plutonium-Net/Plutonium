import { useSyncExternalStore } from 'react'
import {
  ensureConnected,
  getNet,
  probeCustomWisp,
  probeRegions,
  setCustomWisp,
  setEngine,
  setRegion,
  subscribeNet,
} from '@/lib/net/net-store'

export function useNet() {
  const net = useSyncExternalStore(subscribeNet, getNet, getNet)
  return {
    ...net,
    setEngine,
    setRegion,
    setCustomWisp,
    probeRegions,
    probeCustomWisp,
    ensureConnected,
  }
}
