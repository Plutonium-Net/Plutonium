const AI_API = 'https://api.plutoniumnet.work'

export const CHAT_MODELS = [
  { id: 'openai/gpt-oss-120b', label: 'GPT OSS 120B', hint: 'Flagship, deeper answers' },
  { id: 'openai/gpt-oss-20b', label: 'GPT OSS 20B', hint: 'Fast everyday replies' },
  { id: 'groq/compound', label: 'Compound', hint: 'Web search and code execution' },
] as const

export type ChatModel = (typeof CHAT_MODELS)[number]['id']

export const VOICES = [
  { id: 'hannah', label: 'Hannah', hint: 'Balanced' },
  { id: 'autumn', label: 'Autumn', hint: 'Warm' },
  { id: 'diana', label: 'Diana', hint: 'Clear' },
  { id: 'austin', label: 'Austin', hint: 'Confident' },
  { id: 'daniel', label: 'Daniel', hint: 'Deep' },
  { id: 'troy', label: 'Troy', hint: 'Upbeat' },
] as const

export type VoiceId = (typeof VOICES)[number]['id']

const TTS_MODEL = 'canopylabs/orpheus-v1-english'
const STT_MODEL = 'whisper-large-v3-turbo'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

type ChatOptions = {
  token: string
  model: ChatModel
  system: string
  messages: ChatMessage[]
  signal?: AbortSignal
  onToken: (token: string) => void
}

export async function streamChat({ token, model, system, messages, signal, onToken }: ChatOptions): Promise<string> {
  const response = await fetch(`${AI_API}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ model, system, messages }),
    signal,
  })

  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(detail.error || `The AI worker answered ${response.status}`)
  }

  const contentType = (response.headers.get('Content-Type') || '').toLowerCase()
  if (!contentType.includes('text/event-stream') || !response.body) {
    const data = (await response.json().catch(() => ({}))) as { content?: string }
    const content = data.content || ''
    onToken(content)
    return content
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reply = ''

  const consume = (line: string) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    let chunk: { choices?: { delta?: { content?: string } }[] }
    try {
      chunk = JSON.parse(payload)
    } catch {
      return
    }
    const token = chunk.choices?.[0]?.delta?.content
    if (!token) return
    reply += token
    onToken(token)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) consume(line)
  }
  if (buffer) consume(buffer)
  return reply
}

export async function transcribe(blob: Blob, token: string): Promise<string> {
  const form = new FormData()
  form.append('file', blob, 'speech.webm')
  form.append('model', STT_MODEL)
  const response = await fetch(`${AI_API}/ai/transcribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string }
  if (!response.ok) throw new Error(data.error || 'Could not transcribe that')
  return (data.text || '').trim()
}

export async function speak(text: string, voice: VoiceId, token: string, signal?: AbortSignal): Promise<void> {
  const clean = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_`#>]/g, '')
    .trim()
  if (!clean) return

  const response = await fetch(`${AI_API}/ai/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: TTS_MODEL, input: clean.slice(0, 4000), voice, response_format: 'wav' }),
    signal,
  })
  if (!response.ok) throw new Error(`Voice generation failed (${response.status})`)

  const url = URL.createObjectURL(await response.blob())
  try {
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url)
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('Playback failed'))
      void audio.play().catch(reject)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
