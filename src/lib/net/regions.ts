/** Relay + host regions, ported from v1's js/net.js. */

export type RegionFamily = 'wisp' | 'compaxy' | 'rh'

export type RegionServer = {
  id: string
  label: string
  location: string
  lat: number
  lon: number
  host?: string
  flag: string
}

const WISP_URL_TEMPLATE = 'wss://wisp-{id}.plutoniumnet.work/'
export const WISP_REGIONS: RegionServer[] = [
  { id: 'us-east', label: 'US East', location: 'Virginia, USA', flag: '/img/flags/us.png', lat: 37.4316, lon: -78.6569 },
  { id: 'us-east-backup', label: 'US East Backup', location: 'Ohio, USA', flag: '/img/flags/us.png', lat: 39.9612, lon: -82.9988 },
  { id: 'us-west', label: 'US West', location: 'Oregon, USA', flag: '/img/flags/us.png', lat: 43.8041, lon: -120.5542 },
  { id: 'us-west-backup', label: 'US West Backup', location: 'Oregon, USA', flag: '/img/flags/us.png', lat: 44.0521, lon: -123.0868 },
  { id: 'europe', label: 'Europe', location: 'Frankfurt, Germany', flag: '/img/flags/eu.png', lat: 50.1109, lon: 8.6821 },
  { id: 'asia', label: 'Asia', location: 'Singapore', flag: '/img/flags/sg.png', lat: 1.3521, lon: 103.8198 },
]

export const COMPAXY_SERVERS: RegionServer[] = [
  { id: 'us-east-1', label: 'US East 1', location: 'Virginia, USA', host: 'compaxy-us-east-1.plutoniumnet.work', flag: '/img/flags/us.png', lat: 37.4316, lon: -78.6569 },
  { id: 'us-east-2', label: 'US East 2', location: 'Ohio, USA', host: 'compaxy-us-east-2.plutoniumnet.work', flag: '/img/flags/us.png', lat: 39.9612, lon: -82.9988 },
  { id: 'us-west', label: 'US West', location: 'Oregon, USA', host: 'compaxy-us-west.plutoniumnet.work', flag: '/img/flags/us.png', lat: 43.8041, lon: -120.5542 },
  { id: 'europe', label: 'Europe', location: 'Frankfurt, Germany', host: 'compaxy-europe.plutoniumnet.work', flag: '/img/flags/eu.png', lat: 50.1109, lon: 8.6821 },
  { id: 'asia', label: 'Asia', location: 'Singapore', host: 'compaxy-asia.plutoniumnet.work', flag: '/img/flags/sg.png', lat: 1.3521, lon: 103.8198 },
]

export const RH_SERVERS: RegionServer[] = [
  { id: 'us-east', label: 'US East', location: 'Virginia, USA', host: 'rh-us-east.plutoniumnet.work', flag: '/img/flags/us.png', lat: 37.4316, lon: -78.6569 },
  { id: 'us-west', label: 'US West', location: 'Oregon, USA', host: 'rh-us-west.plutoniumnet.work', flag: '/img/flags/us.png', lat: 43.8041, lon: -120.5542 },
  { id: 'europe', label: 'Europe', location: 'Frankfurt, Germany', host: 'rh-europe.plutoniumnet.work', flag: '/img/flags/eu.png', lat: 50.1109, lon: 8.6821 },
  { id: 'asia', label: 'Asia', location: 'Singapore', host: 'rh-asia.plutoniumnet.work', flag: '/img/flags/sg.png', lat: 1.3521, lon: 103.8198 },
]

export function serversFor(family: RegionFamily): RegionServer[] {
  if (family === 'compaxy') return COMPAXY_SERVERS
  if (family === 'rh') return RH_SERVERS
  return WISP_REGIONS
}

export function wispUrl(regionId: string) {
  return WISP_URL_TEMPLATE.replace('{id}', regionId)
}

export function hostFor(family: RegionFamily, regionId: string) {
  return serversFor(family).find((server) => server.id === regionId)?.host || ''
}

export type Ping = { ok: boolean; latency: number | null }

const PING_TIMEOUT_MS = 8000

/** Wisp relays answer a websocket upgrade; the open event is the measurement. */
async function pingWisp(region: RegionServer, timeoutMs: number): Promise<Ping> {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    let settled = false
    let socket: WebSocket | null = null

    const finish = (result: Ping) => {
      if (settled) return
      settled = true
      try {
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) socket.close()
      } catch {
        /* already closed */
      }
      resolve(result)
    }

    try {
      socket = new WebSocket(wispUrl(region.id))
      socket.binaryType = 'arraybuffer'
      const timer = window.setTimeout(() => finish({ ok: false, latency: null }), timeoutMs)
      socket.addEventListener('open', () => {
        window.clearTimeout(timer)
        finish({ ok: true, latency: Math.max(1, Math.round(performance.now() - startedAt)) })
      })
      socket.addEventListener('error', () => {
        window.clearTimeout(timer)
        finish({ ok: false, latency: null })
      })
    } catch {
      finish({ ok: false, latency: null })
    }
  })
}

/** Compaxy and RH answer with a page, so an opaque request is the probe. */
async function pingHost(region: RegionServer, timeoutMs: number): Promise<Ping> {
  if (!region.host) return { ok: false, latency: null }
  const startedAt = performance.now()
  try {
    await fetch(`https://${region.host}/`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { ok: true, latency: Math.max(1, Math.round(performance.now() - startedAt)) }
  } catch {
    return { ok: false, latency: null }
  }
}

export function pingRegion(family: RegionFamily, region: RegionServer, timeoutMs = PING_TIMEOUT_MS) {
  return family === 'wisp' ? pingWisp(region, timeoutMs) : pingHost(region, timeoutMs)
}

/** Pings every region of a family; unreachable rows come back `ok: false`. */
export async function pingAll(family: RegionFamily, timeoutMs = PING_TIMEOUT_MS) {
  const servers = serversFor(family)
  const results = await Promise.all(servers.map((server) => pingRegion(family, server, timeoutMs)))
  const map: Record<string, Ping> = {}
  servers.forEach((server, index) => {
    map[server.id] = results[index]
  })
  return map
}

/** Fastest region that actually answered — unreachable rows never win. */
export function fastest(pings: Record<string, Ping>, preferredId?: string | null) {
  if (preferredId && pings[preferredId]?.ok) return preferredId
  const reachable = Object.entries(pings)
    .filter(([, ping]) => ping.ok && Number.isFinite(ping.latency))
    .sort((a, b) => (a[1].latency || 0) - (b[1].latency || 0))
  return reachable[0]?.[0] || null
}
