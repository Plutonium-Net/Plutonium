/**
 * LuminSDK, the second games source v1 shipped (`cdn.jsdelivr.net/gh/luminsdk/
 * script@latest/lumin.min.js`, then one `Lumin.init`).
 *
 * The current build of that script draws no browse UI of its own — its grid is
 * gone and only the data API is left — so this is their documented "headless"
 * route: `search()` for the catalog, `getImageUrl()` for covers and
 * `getGameUrl()` for a one-time playable URL. `init` still has to run first,
 * because every method refuses to work before it does.
 */

const LUMIN_SCRIPT = 'https://cdn.jsdelivr.net/gh/luminsdk/script@latest/lumin.min.js'
const BOOT_TIMEOUT = 15000
const PLAY_TIMEOUT = 12000

export type LuminGame = {
  id: string
  name: string
  image_token: string
}

export type LuminPage = {
  games: LuminGame[]
  total: number
  page: number
  pages: number
}

type LuminApi = {
  init: (options: Record<string, unknown>) => Promise<void> | void
  search: (query?: string, options?: { page?: number; limit?: number }) => Promise<LuminPage>
  getImageUrl: (token: string) => string | Promise<string>
  getGameUrl: (id: string) => Promise<{ url: string } | string>
}

declare global {
  interface Window {
    Lumin?: LuminApi
  }
}

let scriptRequest: Promise<void> | null = null
let booted = false

function loadScript(): Promise<void> {
  if (scriptRequest) return scriptRequest

  scriptRequest = new Promise((resolve, reject) => {
    const settle = () =>
      window.Lumin ? resolve() : reject(new Error('The Lumin SDK loaded but published no API'))
    const existing = document.querySelector<HTMLScriptElement>('script[data-plu-lumin]')
    if (existing) {
      if (window.Lumin) {
        settle()
        return
      }
      existing.addEventListener('load', settle)
      existing.addEventListener('error', () => reject(new Error('Could not reach the Lumin SDK')))
      return
    }

    const script = document.createElement('script')
    script.src = LUMIN_SCRIPT
    script.async = true
    script.dataset.pluLumin = '1'
    script.addEventListener('load', settle)
    script.addEventListener('error', () => reject(new Error('Could not reach the Lumin SDK')))
    document.head.appendChild(script)
  })

  // A failed load may be retried: the next attempt gets a fresh script tag.
  scriptRequest.catch(() => {
    scriptRequest = null
  })

  return scriptRequest
}

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), ms)),
  ])
}

/**
 * Loads the script and runs `init`. The container stays hidden: this build may or
 * may not draw into it, and either way our own grid is the UI.
 *
 * `init` on this origin is flaky (it intermittently rejects with "domain fetch
 * failed" before settling), so it is attempted a few times. Each attempt gets a
 * fresh child element, because a half-initialised one carries the SDK's shadow
 * root and refuses a second init.
 */
export async function bootLumin(container: HTMLElement | null): Promise<void> {
  if (booted) return
  await loadScript()
  const api = window.Lumin
  if (!api) throw new Error('The Lumin SDK loaded but published no API')

  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const host = container ?? document.querySelector<HTMLElement>('#lumin-container')
    if (!host) throw new Error('LuminSDK has nowhere to start')
    host.replaceChildren()
    const mount = document.createElement('div')
    host.appendChild(mount)

    try {
      await withTimeout(
        Promise.resolve(api.init({ container: mount, theme: 'dark', columns: 6, rows: 4 })),
        BOOT_TIMEOUT,
        'LuminSDK did not finish starting',
      )
      booted = true
      return
    } catch (err) {
      lastError = err
      await new Promise((resolve) => window.setTimeout(resolve, 350))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('LuminSDK did not finish starting')
}

export async function luminSearch(query: string, page = 1): Promise<LuminPage> {
  const api = window.Lumin
  if (!api) throw new Error('LuminSDK is not ready')
  const result = await api.search(query, { page, limit: 24 })
  return {
    games: Array.isArray(result?.games) ? result.games : [],
    total: Number(result?.total) || 0,
    page: Number(result?.page) || page,
    pages: Number(result?.pages) || 1,
  }
}

/** Covers come back as absolute URLs; a missing token just means no artwork. */
export async function luminImage(token: string): Promise<string> {
  if (!token || !window.Lumin) return ''
  try {
    const url = await window.Lumin.getImageUrl(token)
    return typeof url === 'string' ? url : ''
  } catch {
    return ''
  }
}

/** Playable URLs are single-use, so this is called on every play, never cached. */
export async function luminPlayUrl(id: string): Promise<string> {
  const api = window.Lumin
  if (!api) throw new Error('LuminSDK is not ready')
  const result = await withTimeout(api.getGameUrl(id), PLAY_TIMEOUT, 'LuminSDK did not return a game URL')
  const url = typeof result === 'string' ? result : result?.url
  if (!url) throw new Error('LuminSDK returned no game URL')
  return url
}
