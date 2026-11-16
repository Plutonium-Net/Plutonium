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

export async function luminImage(token: string): Promise<string> {
  if (!token || !window.Lumin) return ''
  try {
    const url = await window.Lumin.getImageUrl(token)
    return typeof url === 'string' ? url : ''
  } catch {
    return ''
  }
}

export async function luminPlayUrl(id: string): Promise<string> {
  const api = window.Lumin
  if (!api) throw new Error('LuminSDK is not ready')
  const result = await withTimeout(api.getGameUrl(id), PLAY_TIMEOUT, 'LuminSDK did not return a game URL')
  const url = typeof result === 'string' ? result : result?.url
  if (!url) throw new Error('LuminSDK returned no game URL')
  return url
}
