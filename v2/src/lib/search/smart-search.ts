/**
 * The smart search list behind the search bar, ported from v1's
 * js/newtab-search.js: apps, live suggestions, history matches and one row that
 * always runs the raw query, plus the `/` commands.
 *
 * Suggestions are fetched from Wikipedia's OpenSearch API because Google's
 * suggest endpoint sends no CORS headers, so the browser cannot read it
 * directly. v1 got around that by routing the request through the UV prefix.
 */

import type { HistoryEntry } from '@/lib/history'

export type RowIcon = 'app' | 'clock' | 'command' | 'search' | 'trend'

export type SmartRow = {
  id: string
  label: string
  sub?: string
  icon: RowIcon
  /** Runs when the row is chosen. */
  navigate?: string
  /** Fills the input instead of navigating (command completions). */
  complete?: string
}

export type SmartGroup = { title: string; rows: SmartRow[] }

/** The `pluto://` pages the bar can jump to, matching v1's app shortcuts. */
const PLUTO_APPS = [
  { id: 'games', title: 'Games', sub: 'Play hundreds of browser games instantly' },
  { id: 'ai', title: 'AI', sub: 'Chat with Stelena AI' },
  { id: 'media', title: 'Media', sub: 'Movies, TV and anime' },
  { id: 'vms', title: 'VMs', sub: 'Remote virtual machines' },
  { id: 'apps', title: 'Apps', sub: 'Launch web apps through a server' },
]

const COMMANDS = [
  { cmd: '/g', usage: '/g <query>', sub: 'search games' },
  { cmd: '/ai', usage: '/ai <query>', sub: 'start an AI chat' },
  { cmd: '/watch', usage: '/watch movies|anime|tv <query>', sub: 'find something to watch' },
  { cmd: '/vm', usage: '/vm', sub: 'launch a virtual machine' },
]

// Ask for a few extra, since the API echoes the query back and that row is
// dropped, leaving five to show.
const SUGGEST_FETCH = 8
const SUGGEST_SHOW = 5
const HISTORY_LIMIT = 5
const APP_LIMIT = 3

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Grouped rows that do not need a network round trip. */
export function buildGroups(query: string, history: HistoryEntry[]): SmartGroup[] {
  const trimmed = query.trim()

  if (!trimmed) {
    return [
      {
        title: 'Commands',
        rows: COMMANDS.map((command) => ({
          id: command.cmd,
          label: command.usage,
          sub: command.sub,
          icon: 'command' as const,
          complete: `${command.cmd} `,
        })),
      },
    ]
  }

  if (trimmed.startsWith('/')) return buildCommands(trimmed)

  const lower = trimmed.toLowerCase()
  const groups: SmartGroup[] = []

  const apps = PLUTO_APPS.filter((app) => app.title.toLowerCase().includes(lower)).slice(0, APP_LIMIT)
  if (apps.length) {
    groups.push({
      title: 'Apps',
      rows: apps.map((app) => ({
        id: app.id,
        label: app.title,
        sub: app.sub,
        icon: 'app' as const,
        navigate: `pluto://${app.id}`,
      })),
    })
  }

  const seen = new Set<string>()
  const matches: SmartRow[] = []
  for (const entry of history) {
    if (matches.length >= HISTORY_LIMIT) break
    const haystack = `${entry.title} ${entry.href}`.toLowerCase()
    if (!haystack.includes(lower) || seen.has(entry.href)) continue
    seen.add(entry.href)
    matches.push({
      id: `history-${entry.id}`,
      label: entry.title,
      sub: hostOf(entry.href),
      icon: 'clock',
      navigate: entry.href,
    })
  }
  if (matches.length) groups.push({ title: 'History', rows: matches })

  groups.push({
    title: '',
    rows: [
      {
        id: 'search',
        label: `Search the web for “${trimmed}”`,
        icon: 'search',
        navigate: trimmed,
      },
    ],
  })

  return groups
}

function buildCommands(query: string): SmartGroup[] {
  const parts = query.split(/\s+/)
  const cmd = (parts[0] || '').toLowerCase()
  const rest = parts.slice(1).join(' ')

  if (cmd === '/g') {
    return [
      {
        title: 'Games',
        rows: rest
          ? [
              {
                id: 'games-search',
                label: `Games: “${rest}”`,
                sub: 'Press Enter to open Games',
                icon: 'command',
                navigate: `pluto://games?q=${encodeURIComponent(rest)}`,
              },
            ]
          : [{ id: 'g-usage', label: '/g <query>', sub: 'e.g. /g mario', icon: 'command', complete: '/g ' }],
      },
    ]
  }

  if (cmd === '/ai') {
    return [
      {
        title: 'AI',
        rows: rest
          ? [
              {
                id: 'ai-search',
                label: `Start AI chat: “${rest}”`,
                sub: 'Chat with Stelena AI',
                icon: 'command',
                navigate: `pluto://ai?q=${encodeURIComponent(rest)}`,
              },
            ]
          : [{ id: 'ai-usage', label: '/ai <query>', sub: 'e.g. /ai explain quantum computing', icon: 'command', complete: '/ai ' }],
      },
    ]
  }

  if (cmd === '/watch') {
    const words = rest.split(/\s+/)
    const type = (words[0] || '').toLowerCase()
    const known = ['movies', 'anime', 'tv']
    if (!rest) {
      return [
        {
          title: 'Watch',
          rows: known.map((kind) => ({
            id: `watch-${kind}`,
            label: `/watch ${kind}`,
            sub: kind === 'movies' ? 'Find movies' : kind === 'anime' ? 'Find anime' : 'Find TV shows',
            icon: 'command' as const,
            complete: `/watch ${kind} `,
          })),
        },
      ]
    }
    const category = known.includes(type) ? (type === 'movies' ? 'm' : type === 'anime' ? 'a' : 't') : 'm'
    const term = known.includes(type) ? words.slice(1).join(' ') : rest
    const noun = category === 'm' ? 'movies' : category === 't' ? 'TV' : 'anime'
    return [
      {
        title: 'Watch',
        rows: [
          {
            id: 'watch-search',
            label: `Watch ${noun}: “${term}”`,
            sub: category === 'm' ? 'Movies' : category === 't' ? 'TV' : 'Anime',
            icon: 'command',
            navigate: `pluto://media?category=${category}&search=${encodeURIComponent(term)}`,
          },
        ],
      },
    ]
  }

  if (cmd === '/vm') {
    return [
      {
        title: 'VMs',
        rows: [
          {
            id: 'vm-launch',
            label: 'Launch Virtual Machine',
            sub: 'Remote Chromium session',
            icon: 'command',
            navigate: 'pluto://vms?autostart=1',
          },
        ],
      },
    ]
  }

  const partial = COMMANDS.filter((command) => command.cmd.startsWith(cmd))
  return [
    {
      title: 'Commands',
      rows: (partial.length ? partial : COMMANDS).map((command) => ({
        id: command.cmd,
        label: command.usage,
        sub: command.sub,
        icon: 'command' as const,
        complete: `${command.cmd} `,
      })),
    },
  ]
}

/** Live query suggestions, best effort: an offline list is just empty. */
export async function fetchSuggestions(query: string, signal: AbortSignal): Promise<string[]> {
  const url =
    'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=' +
    SUGGEST_FETCH +
    '&search=' +
    encodeURIComponent(query)

  try {
    const response = await fetch(url, { signal })
    if (!response.ok) return []
    const data = (await response.json()) as [string, string[]]
    return Array.isArray(data?.[1]) ? data[1] : []
  } catch {
    return []
  }
}

export function suggestionRows(query: string, suggestions: string[]): SmartRow[] {
  const lower = query.trim().toLowerCase()
  return suggestions
    .filter((suggestion) => suggestion && suggestion.toLowerCase() !== lower)
    .slice(0, SUGGEST_SHOW)
    .map((suggestion, index) => ({
      id: `suggestion-${index}`,
      label: suggestion,
      sub: 'Web search',
      icon: 'trend' as const,
      navigate: suggestion,
    }))
}
