const REMOTE_WORKER_URL = 'https://api.plutoniumnet.work/net'

export type RemoteSession = {
  sessionId: string | null
  embedUrl: string
  targetUrl: string
}

export async function startRemoteSession(raw: string): Promise<RemoteSession | null> {
  let url = raw.trim()
  if (!url) return null
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  try {
    new URL(url)
  } catch {
    return null
  }

  try {
    const res = await fetch(`${REMOTE_WORKER_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const data = (await res.json().catch(() => ({}))) as { session_id?: string; embed_url?: string; error?: string }
    if (!res.ok || !data.embed_url) {
      console.warn('[remote] session failed:', data.error || res.status)
      return null
    }
    return {
      sessionId: data.session_id || null,
      embedUrl: `${data.embed_url}&controls=false`,
      targetUrl: url,
    }
  } catch (error) {
    console.warn('[remote] session error:', error)
    return null
  }
}

export async function endRemoteSession(sessionId: string | null) {
  if (!sessionId) return
  try {
    await fetch(`${REMOTE_WORKER_URL}/session`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
  } catch {
  }
}
