import type { ChessStatus, ChessState } from './chess'

// The Worker that hosts the room Durable Objects. Override in development with
// VITE_ROOMS_API=http://127.0.0.1:8787 to play against `wrangler dev`.
const API = (
  (import.meta.env.VITE_ROOMS_API as string | undefined) || 'https://api.plutoniumnet.work'
).replace(/\/+$/, '')

export type RoomSeat = {
  seat: number
  color: 'w' | 'b'
  name: string | null
  online: boolean
}

export type RoomSnapshot = {
  code: string
  game: string
  state: ChessState
  status: ChessStatus
  plies: number
  seats: RoomSeat[]
}

export type MoveEcho = { from: number; to: number; seat: number; ply: number }

export async function createRoom(idToken: string): Promise<string> {
  const res = await fetch(`${API}/rooms/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  })
  const body = (await res.json().catch(() => null)) as { code?: string; error?: string } | null
  if (!res.ok || !body?.code) throw new Error(body?.error || 'Could not create a room')
  return body.code
}

type ServerMessage = {
  type?: string
  seat?: number | null
  room?: RoomSnapshot
  last?: MoveEcho
  message?: string
}

export type RoomHandlers = {
  onOpen?: () => void
  onSeat: (seat: number | null, room: RoomSnapshot) => void
  onSnapshot: (room: RoomSnapshot, last: MoveEcho | null) => void
  onError: (message: string) => void
  onClosed: () => void
}

export type RoomLink = {
  play: (from: number, to: number, promotion?: string) => void
  close: () => void
}

export function joinRoom(code: string, idToken: string, handlers: RoomHandlers): RoomLink {
  const socket = new WebSocket(`${API.replace(/^http/, 'ws')}/rooms/${code}/ws`)

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'hello', token: idToken }))
    handlers.onOpen?.()
  })

  socket.addEventListener('message', (event) => {
    let message: ServerMessage
    try {
      message = JSON.parse(String(event.data)) as ServerMessage
    } catch {
      return
    }

    if (message.type === 'welcome' && message.room) {
      handlers.onSeat(message.seat ?? null, message.room)
    } else if (message.type === 'state' && message.room) {
      handlers.onSnapshot(message.room, message.last ?? null)
    } else if (message.type === 'error') {
      handlers.onError(message.message || 'The room rejected that')
    }
  })

  socket.addEventListener('close', () => handlers.onClosed())
  socket.addEventListener('error', () => handlers.onError('Could not reach the room server'))

  return {
    play(from, to, promotion) {
      if (socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify({ type: 'move', from, to, promotion }))
    },
    close() {
      socket.close()
    },
  }
}
