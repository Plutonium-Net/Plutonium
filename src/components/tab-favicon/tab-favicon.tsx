import { useEffect, useState } from 'react'
import { isWebUrl } from '@/lib/net/url'

const PLUTONIUM = '/icon-white.png'

/**
 * The icon a tab shows, taken from the site itself. In-browser pages keep the
 * Plutonium mark; web tabs try their own `/favicon.ico` first and fall back to
 * the icon service for sites that declare theirs elsewhere.
 */
function candidates(url: string) {
  if (!isWebUrl(url)) return [PLUTONIUM]
  try {
    const parsed = new URL(url)
    return [
      `${parsed.origin}/favicon.ico`,
      `https://icons.duckduckgo.com/ip3/${parsed.hostname}.ico`,
      PLUTONIUM,
    ]
  } catch {
    return [PLUTONIUM]
  }
}

export default function TabFavicon({ url }: { url: string }) {
  const [index, setIndex] = useState(0)

  // A tab that navigates gets a fresh set of candidates from its first try.
  useEffect(() => {
    setIndex(0)
  }, [url])

  const list = candidates(url)
  const src = list[Math.min(index, list.length - 1)]

  return (
    <img
      className="chrome-tab-favicon"
      src={src}
      alt=""
      draggable={false}
      onError={() => setIndex((current) => (current < list.length - 1 ? current + 1 : current))}
    />
  )
}
