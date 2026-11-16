/**
 * Data inlined into the single-file build.
 *
 * `vite build --config vite.config.single.js` produces one HTML file with no
 * siblings, so `/data/apps.json` and `/img/apps/*.png` cannot be fetched. The
 * build writes both into the page as `window.__PLU_EMBED__` instead. Everywhere
 * else that global is absent and the app keeps fetching exactly as before.
 */

import type { AppEntry, AppServers } from '@/lib/apps'

export type EmbeddedBundle = {
  apps?: AppEntry[]
  servers?: AppServers
  /** App id -> data URI for its tile. */
  art?: Record<string, string>
}

export function embedded(): EmbeddedBundle | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { __PLU_EMBED__?: EmbeddedBundle }).__PLU_EMBED__
}
