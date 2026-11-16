import type { AppEntry, AppServers } from '@/lib/apps'

export type EmbeddedBundle = {
  apps?: AppEntry[]
  servers?: AppServers
  art?: Record<string, string>
}

export function embedded(): EmbeddedBundle | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { __PLU_EMBED__?: EmbeddedBundle }).__PLU_EMBED__
}
