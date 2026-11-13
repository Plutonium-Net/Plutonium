/** The in-browser pages a tab can point at. Keys are the `pluto://` host. */
const PLUTO_PAGES: Record<string, string> = {
  games: 'Games',
  apps: 'Apps',
  ai: 'AI',
  vms: 'VMs',
  media: 'Media',
}

export type PlutoRoute = {
  id: string
  title: string
  /** The full `pluto://` URL, query and hash included. */
  url: string
  /** `?…` search params, e.g. `q` for a games search or `autostart=1`. */
  params: URLSearchParams
  /** `#…`, which is how a game id is passed. */
  hash: string
}

/** Resolves `pluto://games?q=mario#id` to a page, keeping its route suffix. */
export function resolveUrl(input: string): PlutoRoute | null {
  const raw = input.trim()
  const match = /^pluto:\/\/([^/?#]*)/i.exec(raw)
  if (!match) return null

  const id = match[1].replace(/\/+$/, '').toLowerCase()
  const title = PLUTO_PAGES[id]
  if (!title) return null

  const query = (raw.match(/\?([^#]*)/) || [, ''])[1] || ''
  const hash = (raw.match(/#(.*)$/) || [, ''])[1] || ''

  return {
    id,
    title,
    url: `pluto://${id}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`,
    params: new URLSearchParams(query),
    hash: decodeURIComponent(hash),
  }
}
