/**
 * Pins, ported from v1's js/pins.js: the shortcut tiles that sat under the
 * search bar. v1 kept them in localStorage; here the id list is sessionStorage
 * only and the tile data comes from the same game CDN v1's pin picker read.
 */

export type Pin = {
  id: string
  name: string
  /** Absolute thumbnail URL, when the pin has one. */
  image?: string
  href: string
}

const STORAGE_KEY = 'plu_pins'
const MAX_PINS = 6
const GAMES_CDN = 'https://g.cdn.plutoniumnet.work/'
const GAMES_CONFIG = `${GAMES_CDN}config.json`

/** Shown when the CDN cannot be reached, so the row is never blank. */
const FALLBACK_PINS: Pin[] = [
  { id: 'games', name: 'Games', href: 'pluto://games' },
  { id: 'apps', name: 'Apps', href: 'pluto://apps' },
  { id: 'ai', name: 'AI', href: 'pluto://ai' },
  { id: 'media', name: 'Media', href: 'pluto://media' },
  { id: 'vms', name: 'VMs', href: 'pluto://vms' },
]

type GameEntry = { id: string; name: string; image?: string }

let pins: Pin[] = []
let ready = false
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function subscribePins(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPins() {
  return pins
}

function readIds(): string[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : null
  } catch {
    return null
  }
}

function writeIds(ids: string[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* private mode: the row still renders for this page load */
  }
}

function pinFor(game: GameEntry): Pin {
  return {
    id: game.id,
    name: game.name,
    image: game.image ? GAMES_CDN + game.image : undefined,
    href: `pluto://games?autostart=1#${encodeURIComponent(game.id)}`,
  }
}

async function loadGames(): Promise<GameEntry[]> {
  try {
    const response = await fetch(GAMES_CONFIG)
    if (!response.ok) return []
    const config = (await response.json()) as { games?: GameEntry[] }
    return Array.isArray(config?.games) ? config.games.filter((game) => game?.id && game?.name) : []
  } catch {
    return []
  }
}

/** Fills the row once per page load: stored ids first, else the first few games. */
export function loadPins(): Promise<void> {
  if (ready) return Promise.resolve()
  if (loading) return loading

  loading = loadGames().then((games) => {
    const stored = readIds()
    if (games.length) {
      const chosen = stored ? stored.slice(0, MAX_PINS) : games.slice(0, MAX_PINS).map((game) => game.id)
      if (!stored) writeIds(chosen)
      const byId = new Map(games.map((game) => [game.id, game]))
      pins = chosen.map((id) => byId.get(id)).filter(Boolean).map((game) => pinFor(game as GameEntry))
    }
    if (!pins.length) pins = FALLBACK_PINS
    ready = true
    emit()
  })

  return loading
}
