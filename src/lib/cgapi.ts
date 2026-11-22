const ASSET_BASE = 'https://ludium-public-resources.s3-eu-west-1.amazonaws.com'

export type CgRegion = {
  id: string
  name: string
  short: string
  host: string
}

export const CG_REGIONS: CgRegion[] = [
  { id: 'europe', name: 'CGAPI Europe', short: 'Europe', host: 'cgapi-europe.plutoniumnet.work' },
  { id: 'asia', name: 'CGAPI Asia', short: 'Asia', host: 'cgapi-asia.plutoniumnet.work' },
  { id: 'us-east-2', name: 'CGAPI US East 2', short: 'US East 2', host: 'cgapi-us-east-2.plutoniumnet.work' },
  { id: 'us-east-1', name: 'CGAPI US East 1', short: 'US East 1', host: 'cgapi-us-east-1.plutoniumnet.work' },
  { id: 'us-west', name: 'CGAPI US West', short: 'US West', host: 'cgapi-us-west.plutoniumnet.work' },
]

export type CgHealthState = 'checking' | 'up' | 'down'

export type CgHealth = {
  state: CgHealthState
  ms: number | null
}

export type CgThumb = {
  esc_133_url?: string
  esc_150_url?: string
  esc_200_url?: string
  esc_300_url?: string
  esc_400_url?: string
}

export type CgGame = {
  game_id: string
  title: string
  author?: string
  description?: string
  genres?: { id: string; name: string }[]
  min_players?: number
  max_players?: number
  min_age?: number
  thumb_horizontal?: CgThumb
  thumb_horiz_large?: CgThumb
  thumb_vertical?: CgThumb
}

export type CgGenre = { id: string; name: string }

type CgEnvelope<T> = {
  status?: string
  data?: T
  message?: string
}

export function regionOrigin(region: CgRegion) {
  return `https://${region.host}`
}

export function gameArt(game: CgGame, large = false) {
  const thumb = large ? game.thumb_horiz_large ?? game.thumb_horizontal : game.thumb_horizontal
  const path = large ? thumb?.esc_400_url : thumb?.esc_300_url
  return path ? `${ASSET_BASE}${path}` : null
}

async function cgRequest<T>(region: CgRegion, path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${regionOrigin(region)}${path}`, {
    signal,
    headers: { Accept: 'application/json' },
  })
  const body = (await response.json().catch(() => null)) as CgEnvelope<T> | null
  if (!response.ok) throw new Error(body?.message || `${region.short} answered ${response.status}`)
  if (!body || body.status !== 'OK' || !body.data) throw new Error(`${region.short} returned an unexpected response`)
  return body.data
}

export async function probeHealth(region: CgRegion, signal: AbortSignal): Promise<CgHealth> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  const relay = () => controller.abort()
  signal.addEventListener('abort', relay)
  const started = performance.now()
  try {
    const response = await fetch(`${regionOrigin(region)}/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return { state: 'down', ms: null }
    const body = (await response.json().catch(() => null)) as { status?: string } | null
    if (body?.status !== 'ok') return { state: 'down', ms: null }
    return { state: 'up', ms: Math.round(performance.now() - started) }
  } catch {
    return { state: 'down', ms: null }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', relay)
  }
}

export async function fetchCatalog(region: CgRegion, signal: AbortSignal): Promise<CgGame[]> {
  const data = await cgRequest<{ games?: CgGame[] }>(
    region,
    '/api/catalog/games?locale=en-US&page=0&size=1000',
    signal,
  )
  return (data.games || []).filter((game) => game?.game_id && game?.title)
}

export async function fetchGenres(region: CgRegion, signal: AbortSignal): Promise<CgGenre[]> {
  const data = await cgRequest<CgGenre[]>(region, '/api/catalog/genres', signal)
  return (data || []).filter((genre) => genre?.id && genre?.name)
}

export type CgAccount = {
  email?: string
  token: string
  userId: string
  profileId: string
}

export type CgSession = {
  server: string
  execToken: string
}

export type CgQueueProgress = {
  position: number
  retryIn: number
}

const ACCOUNT_TTL = 6 * 60 * 60 * 1000
const accountCache = new Map<string, { account: CgAccount; at: number }>()
const accountRequests = new Map<string, Promise<CgAccount>>()

function upstreamMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== 'object') return fallback
  const record = body as Record<string, unknown>
  for (const key of ['message', 'error']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return fallback
}

const ACCOUNT_ATTEMPTS = 4

class CgAccountError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.retryable = retryable
  }
}

async function createAccount(region: CgRegion): Promise<CgAccount> {
  let response: Response
  try {
    response = await fetch(`${regionOrigin(region)}/api/accounts`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new CgAccountError(`${region.short} could not be reached`, true)
  }
  const body = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: Partial<CgAccount>; error?: string; message?: string }
    | null
  if (!response.ok || !body?.success) {
    throw new CgAccountError(
      upstreamMessage(body, `${region.short} could not issue a game account (${response.status})`),
      response.status >= 500,
    )
  }
  const data = body.data
  if (!data?.token || !data.userId || !data.profileId) {
    throw new CgAccountError(`${region.short} returned an incomplete game account`, true)
  }
  return {
    email: data.email,
    token: data.token,
    userId: data.userId,
    profileId: data.profileId,
  }
}

async function requestAccount(region: CgRegion): Promise<CgAccount> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= ACCOUNT_ATTEMPTS; attempt += 1) {
    try {
      const account = await createAccount(region)
      accountCache.set(region.id, { account, at: Date.now() })
      return account
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const retryable = error instanceof CgAccountError && error.retryable
      if (!retryable || attempt === ACCOUNT_ATTEMPTS) throw lastError
      await new Promise((resolve) => window.setTimeout(resolve, 1200 * attempt))
    }
  }
  throw lastError ?? new Error(`${region.short} could not issue a game account`)
}

/**
 * Returns a reusable upstream account, creating one only when the cache is cold.
 * Concurrent callers share one request so a double-mounted effect cannot
 * provision two accounts at once.
 */
export async function ensureAccount(region: CgRegion, options: { force?: boolean } = {}): Promise<CgAccount> {
  const cached = accountCache.get(region.id)
  if (!options.force && cached && Date.now() - cached.at < ACCOUNT_TTL) return cached.account

  const pending = accountRequests.get(region.id)
  if (pending) return pending

  const request = requestAccount(region)
  accountRequests.set(region.id, request)
  void request
    .catch(() => {})
    .finally(() => {
      if (accountRequests.get(region.id) === request) accountRequests.delete(region.id)
    })
  return request
}

/** Starts a session and resolves once the game server hands out its signaling host. */
export async function startStream(
  region: CgRegion,
  account: CgAccount,
  game: { id: string; name?: string },
  options: {
    lang?: string
    signal?: AbortSignal
    onQueue?: (progress: CgQueueProgress) => void
  } = {},
): Promise<CgSession> {
  const response = await fetch(`${regionOrigin(region)}/api/stream`, {
    method: 'POST',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      token: account.token,
      userId: account.userId,
      profileId: account.profileId,
      gameId: game.id,
      gameName: game.name,
      lang: options.lang || 'en-US',
    }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(upstreamMessage(body, `${region.short} could not start the session (${response.status})`))
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/event-stream')) {
    const body = (await response.json().catch(() => null)) as
      | { success?: boolean; data?: CgSession; error?: string; message?: string }
      | null
    if (!body?.success || !body.data?.server || !body.data.execToken) {
      throw new Error(upstreamMessage(body, `${region.short} returned no stream details`))
    }
    return body.data
  }

  if (!response.body) throw new Error(`${region.short} sent an empty stream`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      for (let split = buffer.indexOf('\n\n'); split !== -1; split = buffer.indexOf('\n\n')) {
        const block = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)
        const event = /^event:\s*(.+)$/m.exec(block)?.[1]?.trim()
        const raw = /^data:\s*(.+)$/m.exec(block)?.[1]?.trim()
        if (!event || !raw) continue
        let payload: Record<string, unknown>
        try {
          payload = JSON.parse(raw) as Record<string, unknown>
        } catch {
          continue
        }
        if (event === 'queue') {
          options.onQueue?.({
            position: Number(payload.position) || 0,
            retryIn: Number(payload.retryIn) || 0,
          })
          continue
        }
        if (event === 'ready') {
          const server = typeof payload.server === 'string' ? payload.server : ''
          const execToken = typeof payload.execToken === 'string' ? payload.execToken : ''
          if (!server || !execToken) break
          return { server, execToken }
        }
        if (event === 'error') {
          throw new Error(
            typeof payload.error === 'string' ? payload.error : `${region.short} could not start the session`,
          )
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }

  if (options.signal?.aborted) throw new Error('Session cancelled')
  throw new Error('The stream ended before the game server was ready')
}
