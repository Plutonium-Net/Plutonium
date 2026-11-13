/**
 * The game catalog, from the same CDN v1's games page reads. One fetch per page
 * load, shared by the games page and the pins row.
 */

export const GAME_CDN = 'https://g.cdn.plutoniumnet.work'

export type Game = {
  id: string
  name: string
  path: string
  image?: string
  description?: string
}

let cached: Game[] | null = null
let pending: Promise<Game[]> | null = null

export function imageUrl(game: Game) {
  if (!game.image) return ''
  return /^https?:/i.test(game.image) ? game.image : `${GAME_CDN}/${game.image}`
}

export function gameUrl(game: Game) {
  return `${GAME_CDN}/${game.path}`
}

export function loadGames(): Promise<Game[]> {
  if (cached) return Promise.resolve(cached)
  if (pending) return pending

  pending = fetch(`${GAME_CDN}/config.json`, { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((config: { games?: Game[] } | null) => {
      cached = Array.isArray(config?.games) ? config.games.filter((game) => game?.id && game?.path) : []
      return cached
    })
    .catch(() => (cached = []))
    .finally(() => {
      pending = null
    })

  return pending
}
