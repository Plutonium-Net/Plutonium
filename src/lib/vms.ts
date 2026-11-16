const VM_API = 'https://api.plutoniumnet.work/vm/session'

export const SESSION_SECONDS = 900

export type VmSession = {
  sessionId: string | null
  embedUrl: string
}

type VmResponse = {
  session_id?: string
  embed_url?: string
  error?: string
  message?: string
}

export async function createVmSession(idToken: string): Promise<VmSession> {
  const response = await fetch(VM_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action: 'create' }),
  })

  const data = (await response.json().catch(() => ({}))) as VmResponse
  if (!response.ok) throw new Error(data.error || data.message || `The worker answered ${response.status}`)
  if (!data.embed_url) throw new Error('The worker did not return a session')
  return { sessionId: data.session_id || null, embedUrl: data.embed_url }
}

export async function endVmSession(sessionId: string | null, idToken: string | null) {
  if (!sessionId) return
  try {
    await fetch(VM_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken || ''}` },
      body: JSON.stringify({ action: 'delete', session_id: sessionId }),
    })
  } catch {
  }
}

export function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}
