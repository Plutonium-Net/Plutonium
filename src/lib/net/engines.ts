import { embedded } from '@/lib/embedded'
import { hostFor, wispUrl, type RegionFamily } from './regions'

export type EngineId = 'core' | 'runtime' | 'runtimev2' | 'compaxy' | 'rh' | 'remote'

export type EngineOption = {
  id: EngineId
  label: string
  family: RegionFamily | null
  hint: string
  logo: string
}

const ALL_ENGINES: EngineOption[] = [
  { id: 'compaxy', label: 'Compaxy', family: 'compaxy', hint: 'AIO Proxy', logo: '/img/3rd-party/compaxy.png' },
  { id: 'core', label: '\u054d\u217ctr\u0430\u2174\u0456\u043e\u217c\u0435t', family: 'wisp', hint: 'Wisp relay', logo: '/img/3rd-party/core.png' },
  { id: 'runtime', label: '\u054f\u0441r\u0430\u217f\u0458\u0435t V1', family: 'wisp', hint: 'Wisp relay', logo: '/img/3rd-party/runtime.png' },
  { id: 'runtimev2', label: '\u054f\u0441r\u0430\u217f\u0458\u0435t V2', family: 'wisp', hint: 'Wisp relay', logo: '/img/3rd-party/runtime.png' },
  { id: 'rh', label: '\u0154\u0430\u217f\u217f\u0435r\u1e23\u0435\u0430\u1e0b', family: 'rh', hint: 'Host proxy', logo: '/img/3rd-party/rh.png' },
  { id: 'remote', label: 'Hyperbeam', family: null, hint: 'Remote session', logo: '/img/3rd-party/remote.png' },
]

export const ENGINES: EngineOption[] = embedded()
  ? ALL_ENGINES.filter((option) => option.family !== 'wisp')
  : ALL_ENGINES

export function familyFor(engine: EngineId): RegionFamily | null {
  return ENGINES.find((option) => option.id === engine)?.family ?? null
}

export function engineLabel(engine: EngineId) {
  return ENGINES.find((option) => option.id === engine)?.label ?? engine
}

let coreReady = false
let runtimeReady = false
let runtimeController: ScramjetControllerInstance | null = null
let bridgeReady = false
let bridgeConnection: BareMuxConnectionInstance | null = null
let runtimeV2Ready = false
let bridgePromise: Promise<boolean> | null = null

async function initCore() {
  if (coreReady) return true
  if (!('serviceWorker' in navigator)) return false
  if (typeof window.__uv$config === 'undefined') return false
  try {
    await navigator.serviceWorker.register('/core/sw.js', { scope: '/core/' })
    coreReady = true
    return true
  } catch (error) {
    console.warn('[net] UV service worker registration failed:', error)
    return false
  }
}

async function initRuntime() {
  if (runtimeReady) return true
  const loader = window.$scramjetLoadController
  if (!loader) return false
  if (!('serviceWorker' in navigator)) return false

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })

    await new Promise<void>((resolve) => {
      const req = indexedDB.open('$scramjet')
      req.onupgradeneeded = () => {
        try {
          req.transaction?.abort()
        } catch {
        }
      }
      req.onsuccess = () => {
        const db = req.result
        const needed = ['config', 'cookies', 'redirectTrackers', 'referrerPolicies', 'publicSuffixList']
        const missing = needed.filter((store) => !db.objectStoreNames.contains(store))
        db.close()
        if (!missing.length) {
          resolve()
          return
        }
        const del = indexedDB.deleteDatabase('$scramjet')
        del.onsuccess = del.onerror = del.onblocked = () => resolve()
      }
      req.onerror = () => resolve()
    })

    const { ScramjetController } = loader()
    runtimeController = new ScramjetController({
      prefix: '/runtime/service/',
      files: { wasm: '/runtime/engine.wasm', all: '/runtime/all.js', sync: '/runtime/sync.js' },
    })
    await runtimeController.init()
    runtimeReady = true
    return true
  } catch (error) {
    console.warn('[net] Scramjet V1 init failed:', error)
    return false
  }
}

async function initBridge(relayUrl: string) {
  if (bridgeReady && bridgeConnection) {
    await bridgeConnection.setTransport('/mesh/index.mjs', [{ wisp: relayUrl }])
    return true
  }
  if (bridgePromise) return bridgePromise

  bridgePromise = (async () => {
    if (!window.BareMux) {
      console.warn('[net] BareMux missing')
      return false
    }
    try {
      const connection = new window.BareMux.BareMuxConnection('/bridge/worker.js')
      await connection.setTransport('/mesh/index.mjs', [{ wisp: relayUrl }])
      bridgeConnection = connection
      bridgeReady = !!(await connection.getTransport())
      return bridgeReady
    } catch (error) {
      console.warn('[net] BareMux transport failed:', error)
      bridgeReady = false
      return false
    } finally {
      bridgePromise = null
    }
  })()

  return bridgePromise
}

async function ensureRuntimeV2(relayUrl: string) {
  if (!window.PluRuntimeV2) return false
  if (runtimeV2Ready) return true

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (error) {
    console.warn('[net] root worker registration failed:', error)
  }

  try {
    runtimeV2Ready = await window.PluRuntimeV2.ensure(relayUrl)
    return runtimeV2Ready
  } catch (error) {
    console.warn('[net] Scramjet V2 init failed:', error)
    runtimeV2Ready = false
    return false
  }
}

export async function retargetRuntimeV2(relayUrl: string) {
  if (!runtimeV2Ready || !window.PluRuntimeV2) return
  try {
    await window.PluRuntimeV2.setRelay(relayUrl)
  } catch (error) {
    console.warn('[net] Scramjet V2 relay switch failed:', error)
  }
}

export async function initEngine(engine: EngineId, relayUrl: string) {
  if (engine === 'core') {
    const [uv] = await Promise.all([initCore(), initRuntime()])
    if (!uv) return false
    return initBridge(relayUrl)
  }
  if (engine === 'runtime') {
    const ready = await initRuntime()
    if (!ready) return false
    return initBridge(relayUrl)
  }
  if (engine === 'runtimev2') return ensureRuntimeV2(relayUrl)
  return true
}

export function isEngineReady(engine: EngineId) {
  if (engine === 'core') return coreReady && bridgeReady
  if (engine === 'runtime') return runtimeReady && bridgeReady
  if (engine === 'runtimev2') return runtimeV2Ready
  return true
}

export function encodeUrl(engine: EngineId, url: string, region: string) {
  const family = familyFor(engine)
  if (family === 'compaxy' || family === 'rh') {
    const host = hostFor(family, region)
    return host ? `https://${host}/?url=${encodeURIComponent(url)}` : url
  }
  if (engine === 'runtimev2') return window.PluRuntimeV2 ? window.PluRuntimeV2.encodeUrl(url) : url
  if (engine === 'runtime') return runtimeController ? runtimeController.encodeUrl(url) : url
  if (engine === 'core') {
    const config = window.__uv$config
    return config ? config.prefix + config.encodeUrl(url) : url
  }
  return url
}

export function decodeUrl(engine: EngineId, frameUrl: string) {
  const family = familyFor(engine)
  if (family === 'compaxy' || family === 'rh') {
    try {
      const absolute = new URL(frameUrl, window.location.origin)
      const viaQuery = absolute.searchParams.get('url')
      if (viaQuery) return viaQuery
      const viaPath = absolute.pathname.match(/^\/[0-9a-f]{32}\/(.+)$/i)
      if (family === 'rh' && viaPath) return decodeURIComponent(viaPath[1]) + absolute.search + absolute.hash
    } catch {
    }
    return frameUrl
  }
  if (engine === 'runtimev2') return window.PluRuntimeV2 ? window.PluRuntimeV2.decodeUrl(frameUrl) : frameUrl
  if (engine === 'runtime') {
    try {
      if (runtimeController && frameUrl.includes('/runtime/service/')) return runtimeController.decodeUrl(frameUrl)
    } catch {
    }
    return frameUrl
  }
  if (engine === 'core') {
    const config = window.__uv$config
    if (!config) return frameUrl
    try {
      const absolute = new URL(frameUrl, window.location.origin)
      if (absolute.pathname.startsWith(config.prefix)) {
        const encoded = absolute.pathname.slice(config.prefix.length) + absolute.search + absolute.hash
        return config.decodeUrl(encoded)
      }
    } catch {
    }
  }
  return frameUrl
}

export function relayFor(region: string) {
  return wispUrl(region)
}
