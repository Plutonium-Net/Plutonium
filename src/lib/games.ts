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

export function searchGames(games: Game[], query: string): Game[] {
  const needle = query.trim().toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')
  if (!needle) return games

  const scored: Array<{ game: Game; score: number }> = []
  for (const game of games) {
    const score = scoreName(game.name.toLowerCase(), needle)
    if (score > 0) scored.push({ game, score })
  }
  scored.sort((a, b) => b.score - a.score || a.game.name.localeCompare(b.game.name))
  return scored.map((entry) => entry.game)
}

function scoreName(name: string, needle: string) {
  if (name === needle) return 1000

  const words = name.split(/[^a-z0-9]+/).filter(Boolean)
  const compact = words.join(' ')

  if (compact.startsWith(needle)) return 920 - Math.min(80, compact.length - needle.length)

  const wordIndex = words.findIndex((word) => word.startsWith(needle))
  if (wordIndex !== -1) return 800 - wordIndex * 12 - Math.min(60, compact.length - needle.length)

  const at = compact.indexOf(needle)
  if (at !== -1) return 640 - Math.min(160, at * 3) - Math.min(60, compact.length - needle.length)

  const parts = needle.split(' ').filter(Boolean)
  if (parts.length > 1 && parts.every((part) => compact.includes(part))) {
    return 560 - Math.min(120, compact.length - needle.length)
  }

  const skips = subsequenceGaps(compact, needle)
  if (skips !== null) return 400 - Math.min(140, skips * 6)

  if (needle.length >= 4) {
    const target = words.find((word) => Math.abs(word.length - needle.length) <= 1)
    if (target && withinOneEdit(target, needle)) return 300
    for (const word of words) if (word.length >= 4 && withinOneEdit(word, needle)) return 260
  }

  return 0
}

function subsequenceGaps(haystack: string, needle: string) {
  let index = -1
  let gaps = 0
  for (const char of needle.replace(/ /g, '')) {
    const next = haystack.indexOf(char, index + 1)
    if (next === -1) return null
    gaps += next - index - 1
    index = next
  }
  return gaps
}

function withinOneEdit(a: string, b: string) {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (long.length - short.length > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i += 1
      j += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (short.length === long.length) i += 1
    j += 1
  }
  return edits + (short.length - i) + (long.length - j) <= 1
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
