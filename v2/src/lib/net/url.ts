/** v1's input rules: explicit scheme wins, a bare domain gets https, else search. */
export type NormalizedInput = { url: string; type: 'web' | 'search' }

const SEARCH_URL = 'https://www.duckduckgo.com/search?q='

export function normalizeInput(raw: string): NormalizedInput | null {
  const input = raw.trim()
  if (!input) return null

  if (/^https?:\/\//i.test(input)) return { url: input, type: 'web' }
  if (/^about:/i.test(input)) return { url: input, type: 'web' }

  if (input.includes('.') && !/\s/.test(input)) return { url: `https://${input}`, type: 'web' }

  return { url: SEARCH_URL + encodeURIComponent(input), type: 'search' }
}

/** `example.com/path` → `example.com`, the tab label v1 falls back to. */
export function titleFor(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host) return host
  } catch {
    /* about:, data:, malformed */
  }
  if (url === 'newtab') return 'New Tab'
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '') || 'New Tab'
}

export function isWebUrl(url: string) {
  return /^https?:\/\//i.test(url)
}
