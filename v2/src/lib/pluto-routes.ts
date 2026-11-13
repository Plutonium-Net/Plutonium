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
  url: string
}

/** Resolves `pluto://games` (with optional path, query, hash or case noise) to a page. */
export function resolveUrl(input: string): PlutoRoute | null {
  const match = /^pluto:\/\/([^/?#]*)/i.exec(input.trim())
  if (!match) return null

  const id = match[1].replace(/\/+$/, '').toLowerCase()
  const title = PLUTO_PAGES[id]
  return title ? { id, title, url: `pluto://${id}` } : null
}
