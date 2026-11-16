/**
 * The Apps catalog, ported from v1's js/apps.js.
 *
 * v1 read `data/apps.json` and `data/app-servers.json` straight from the site.
 * Same files, same shape: each app is opened in a frame built from the chosen
 * server's `urlTemplate`, where `{url}` inserts the address and `{url_enc}`
 * inserts it percent-encoded.
 */

import { embedded } from '@/lib/embedded'

/** Art that is a cut-out logo rather than a filled tile, so it needs a light card. */
export const LIGHT_ART = new Set(['duckduckgo', 'twitch', 'youtube', 'pinterest'])

export type AppEntry = {
  id: string
  name: string
  description: string
  url: string
  icon: string
  color: string
  category: string
}

export type AppServer = {
  id: string
  name: string
  location: string
  flagSrc: string
  urlTemplate: string
}

export type AppServers = {
  defaultId: string
  servers: AppServer[]
}

const APPS_URL = '/data/apps.json'
const SERVERS_URL = '/data/app-servers.json'
const ART_BASE = '/img/apps/'

let appsCache: AppEntry[] | null = null
let serversCache: AppServers | null = null

export async function loadApps(): Promise<AppEntry[]> {
  if (appsCache) return appsCache
  // The single-file build carries its catalog in the page; nothing to fetch.
  const built = embedded()?.apps
  if (built?.length) {
    appsCache = built
    return appsCache
  }
  const response = await fetch(APPS_URL)
  if (!response.ok) throw new Error(`apps.json: ${response.status}`)
  const data = (await response.json()) as AppEntry[]
  appsCache = Array.isArray(data)
    ? data.filter((app) => app && typeof app.id === 'string' && typeof app.name === 'string' && typeof app.url === 'string')
    : []
  return appsCache
}

export async function loadServers(): Promise<AppServers> {
  if (serversCache) return serversCache
  const built = embedded()?.servers
  if (built?.servers?.length) {
    serversCache = built
    return serversCache
  }
  const response = await fetch(SERVERS_URL)
  if (!response.ok) throw new Error(`app-servers.json: ${response.status}`)
  const data = (await response.json()) as { default?: string; servers?: AppServer[] }
  const servers = Array.isArray(data.servers) ? data.servers.filter((server) => server?.id && server?.urlTemplate) : []
  serversCache = {
    defaultId: data.default || servers[0]?.id || '',
    servers,
  }
  return serversCache
}

/** Cover art for an app id, e.g. `/img/apps/youtube.png`. */
export function artFor(app: AppEntry) {
  const built = embedded()?.art
  if (built?.[app.id]) return built[app.id]
  return `${ART_BASE}${app.id}.png`
}

/** The frame URL for one app through one server. */
export function frameUrl(server: AppServer | null, rawUrl: string) {
  const template = server?.urlTemplate || '{url}'
  return template.replace(/\{url_enc\}/g, encodeURIComponent(rawUrl)).replace(/\{url\}/g, rawUrl)
}
