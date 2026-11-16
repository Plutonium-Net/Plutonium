import { getPref, loadPrefs, setPref } from '@/lib/prefs'
import { ENGINES, familyFor, initEngine, retargetRuntimeV2, type EngineId } from './engines'
import { fastest, pingAll, serversFor, wispUrl, type Ping, type RegionFamily } from './regions'

export type NetStatus = 'idle' | 'connecting' | 'ok' | 'error'

export type NetSnapshot = {
  engine: EngineId
  regions: Record<RegionFamily, string>
  status: NetStatus
  ready: boolean
  latency: number | null
  pings: Partial<Record<RegionFamily, Record<string, Ping>>>
  error: string | null
}

const STORE_KEY = 'plu_net'
const DEFAULT_ENGINE: EngineId = 'compaxy'

function readPrefs() {
  const fallback = {
    engine: DEFAULT_ENGINE,
    regions: { wisp: serversFor('wisp')[0].id, compaxy: serversFor('compaxy')[0].id, rh: serversFor('rh')[0].id },
  }
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<{ engine: EngineId; regions: Record<RegionFamily, string> }>
    const engine = ENGINES.some((option) => option.id === parsed.engine) ? (parsed.engine as EngineId) : fallback.engine
    return { engine, regions: { ...fallback.regions, ...(parsed.regions || {}) } }
  } catch {
    return fallback
  }
}

const prefs = readPrefs()

let state: NetSnapshot = {
  engine: prefs.engine,
  regions: prefs.regions,
  status: 'idle',
  ready: false,
  latency: null,
  pings: {},
  error: null,
}

const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((fn) => fn())
}

function setState(patch: Partial<NetSnapshot>) {
  state = { ...state, ...patch }
  emit()
}

function persist() {
  const choice = { engine: state.engine, regions: state.regions }
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(choice))
  } catch {
  }
  setPref('net', choice)
}

void loadPrefs().then(() => {
  const saved = getPref<{ engine?: EngineId; regions?: Partial<Record<RegionFamily, string>> }>('net')
  if (!saved) return
  if (state.ready || state.status === 'connecting') return
  const engine = ENGINES.some((option) => option.id === saved.engine) ? (saved.engine as EngineId) : state.engine
  setState({ engine, regions: { ...state.regions, ...(saved.regions || {}) } })
})

export function getNet() {
  return state
}

export function subscribeNet(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let connecting: Promise<void> | null = null

async function connect() {
  const family = familyFor(state.engine)
  setState({ status: 'connecting', error: null })

  if (!family) {
    setState({ status: 'ok', ready: true, latency: null })
    return
  }

  const pings = await pingAll(family)
  const chosen = fastest(pings, state.regions[family])

  if (!chosen) {
    setState({
      status: 'error',
      ready: false,
      pings: { ...state.pings, [family]: pings },
      error: `No reachable ${family === 'wisp' ? 'relay' : 'server'}`,
    })
    return
  }

  const relayUrl = family === 'wisp' ? wispUrl(chosen) : ''
  const ok = await initEngine(state.engine, relayUrl)
  setState({
    regions: { ...state.regions, [family]: chosen },
    pings: { ...state.pings, [family]: pings },
    status: ok ? 'ok' : 'error',
    ready: ok,
    latency: pings[chosen]?.latency ?? null,
    error: ok ? null : `${state.engine} could not start`,
  })
  persist()
}

export function ensureConnected() {
  if (state.ready && state.status === 'ok') return Promise.resolve()
  if (!connecting) {
    connecting = connect().finally(() => {
      connecting = null
    })
  }
  return connecting
}

export async function setEngine(engine: EngineId) {
  if (!ENGINES.some((option) => option.id === engine)) return
  setState({ engine, ready: false, status: 'idle', latency: null })
  persist()
  await ensureConnected()
}

export async function setRegion(family: RegionFamily, regionId: string) {
  if (!serversFor(family).some((server) => server.id === regionId)) return
  setState({ regions: { ...state.regions, [family]: regionId }, latency: state.pings[family]?.[regionId]?.latency ?? null })
  persist()

  if (familyFor(state.engine) !== family) return

  if (state.engine === 'runtimev2') {
    await retargetRuntimeV2(wispUrl(regionId))
    setState({ status: 'ok', ready: true })
    return
  }
  setState({ ready: false })
  await ensureConnected()
}

export async function probeRegions(family: RegionFamily) {
  const pings = await pingAll(family)
  setState({ pings: { ...state.pings, [family]: pings } })
  return pings
}
