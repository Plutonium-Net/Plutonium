const PLUTO_PAGES: Record<string, string> = {
  games: 'Games',
  playables: 'Playables',
  apps: 'Apps',
  ai: 'AI',
  vms: 'VMs',
  media: 'Media',
  'cloud-gaming': 'Cloud Gaming',
  ptransfer: 'pTransfer',
}

export type PlutoRoute = {
  id: string
  title: string
  url: string
  params: URLSearchParams
  hash: string
}

export function resolveUrl(input: string): PlutoRoute | null {
  const raw = input.trim()
  const match = /^pluto:\/\/([^/?#]*)/i.exec(raw)
  if (!match) return null

  const id = match[1].replace(/\/+$/, '').toLowerCase()
  const title = !id ? null : (PLUTO_PAGES[id] ?? id.charAt(0).toUpperCase() + id.slice(1))
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
