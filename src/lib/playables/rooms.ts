import type { ChessState } from './chess'

// The Worker that hosts the room Durable Objects. Override in development with
// VITE_ROOMS_API=http://127.0.0.1:8787 to play against `wrangler dev`.
const API = (
  (import.meta.env.VITE_ROOMS_API as string | undefined) || 'https://api.plutoniumnet.work'
).replace(/\/+$/, '')

export type RoomGame = 'chess' | 'checkers' | 'connect4'

export type RoomSeat = {
  seat: number
  /** 'w'/'b' for chess, 'r'/'b' for checkers. */
  color: string
  name: string | null
  online: boolean
}

export type RoomSnapshot<S = ChessState> = {
  code: string
  game: RoomGame
  state: S
  status: string
  plies: number
  seats: RoomSeat[]
}

export type MoveEcho = {
  from: number
  to: number
  seat: number
  ply: number
  captured?: number | null
  promotion?: 'q' | 'r' | 'b' | 'n' | null
  /** Checkers: the move crowned a man. */
  kinged?: boolean
  /** Connect 4: the column played and the cell the disc landed on. */
  col?: number
  cell?: number
}

export async function createRoom(idToken: string, game: RoomGame = 'chess'): Promise<string> {
  const res = await fetch(`${API}/rooms/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ game }),
  })
  const body = (await res.json().catch(() => null)) as { code?: string; error?: string } | null
  if (!res.ok || !body?.code) throw new Error(body?.error || 'Could not create a room')
  return body.code
}

type ServerMessage<S> = {
  type?: string
  seat?: number | null
  room?: RoomSnapshot<S>
  last?: MoveEcho
  message?: string
}

export type RoomHandlers<S = ChessState> = {
  onOpen?: () => void
  onSeat: (seat: number | null, room: RoomSnapshot<S>) => void
  onSnapshot: (room: RoomSnapshot<S>, last: MoveEcho | null) => void
  onError: (message: string) => void
  onClosed: () => void
}

export type RoomMove = { from?: number; to?: number; promotion?: string; col?: number }

export type RoomLink = {
  move: (payload: RoomMove) => void
  close: () => void
}

export function joinRoom<S = ChessState>(
  code: string,
  game: RoomGame,
  idToken: string,
  handlers: RoomHandlers<S>,
): RoomLink {
  const socket = new WebSocket(`${API.replace(/^http/, 'ws')}/rooms/${game}/${code}/ws`)

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'hello', token: idToken }))
    handlers.onOpen?.()
  })

  socket.addEventListener('message', (event) => {
    let message: ServerMessage<S>
    try {
      message = JSON.parse(String(event.data)) as ServerMessage<S>
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
    move(payload) {
      if (socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify({ type: 'move', ...payload }))
    },
    close() {
      socket.close()
    },
  }
}
