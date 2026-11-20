import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  applyMove,
  drawReason,
  fileOf,
  inCheck,
  initialGame,
  legalMoves,
  rankOf,
  statusOf,
  type ChessState,
  type Color,
  type PieceType,
} from '@/lib/playables/chess'
import { createRoom, joinRoom, type RoomLink, type RoomSnapshot } from '@/lib/playables/rooms'
import { useAccount } from '@/hooks/use-account'

// Drawn as SVG rather than font glyphs: symbol fonts render chess pieces with
// wildly different weights and fall back inconsistently across machines.
const PIECE_SHAPES: Record<PieceType, ReactNode> = {
  p: (
    <>
      <circle cx="16" cy="9.6" r="4.3" />
      <path d="M12.9 14.4h6.2l3 6.2c-.5 1-1.6 1.6-2.8 1.6h-3.6c-1.2 0-2.3-.6-2.8-1.6z" />
      <rect x="8.2" y="22.6" width="15.6" height="2.6" rx="1" />
      <rect x="7.6" y="25" width="16.8" height="4.2" rx="1.3" />
    </>
  ),
  r: (
    <>
      <path d="M10.8 24.8V12.6h10.4v12.2z" />
      <rect x="9" y="7.8" width="4.2" height="5.4" rx="0.6" />
      <rect x="13.9" y="7.8" width="4.2" height="5.4" rx="0.6" />
      <rect x="18.8" y="7.8" width="4.2" height="5.4" rx="0.6" />
      <rect x="9" y="12.2" width="14" height="2.8" rx="0.9" />
      <rect x="7.8" y="24.6" width="16.4" height="2.8" rx="1.1" />
      <rect x="7.4" y="26.8" width="17.2" height="2.6" rx="1.2" />
    </>
  ),
  n: (
    <>
      <path d="M9.2 24.6c0-4.2 1.4-7.2 4.4-9.6 1.8-1.4 2.5-3 2-4.8-.4-1.5-1.8-2.2-3.1-1.7-1 .4-1.4 1.7-2.5 2.2-1.5.7-3.2-.3-3.2-2.1 0-2.9 2.7-5.2 6.1-5.4 1.6-.1 2.9-1 4.5-1.1 2.5-.2 3.8 1.5 4.6 3.7 1.1 3.2 1.1 6.7.1 10-.6 1.9-.8 5.1-.5 8.8z" />
      <circle cx="17.6" cy="7.4" r="1" fill="none" strokeWidth="1.1" />
      <rect x="8.4" y="24.6" width="15.2" height="2.8" rx="1.1" />
      <rect x="7.6" y="26.8" width="16.8" height="2.6" rx="1.2" />
    </>
  ),
  b: (
    <>
      <circle cx="16" cy="4.4" r="2" />
      <path d="M16 6.9c3.4 0 5.3 2.5 4.8 5.2-.4 2.4-2.4 4-2.9 6.9h-3.8c-.5-2.9-2.5-4.5-2.9-6.9C10.7 9.4 12.6 6.9 16 6.9z" />
      <path d="M16 9.6v3.8" fill="none" strokeWidth="1.2" />
      <path d="M11.6 19.2h8.8l1 3.6H10.6z" />
      <rect x="8.4" y="22.6" width="15.2" height="2.6" rx="1" />
      <rect x="7.6" y="25" width="16.8" height="4.2" rx="1.3" />
    </>
  ),
  q: (
    <>
      <path d="M8.8 24.4 9.6 10.4l4.4 4.4L16 6.6l2 8.2 4.4-4.4L23.2 24.4z" />
      <circle cx="9.4" cy="9" r="2" />
      <circle cx="16" cy="5.4" r="2.2" />
      <circle cx="22.6" cy="9" r="2" />
      <rect x="7.6" y="23.8" width="16.8" height="2.8" rx="1.1" />
      <rect x="7.2" y="26.2" width="17.6" height="3" rx="1.3" />
    </>
  ),
  k: (
    <>
      <rect x="14.7" y="1.8" width="2.6" height="7.6" rx="0.6" />
      <rect x="12" y="4.6" width="8" height="2.6" rx="0.6" />
      <path d="M11 24.4c0-4 .4-7 1.3-9.6l3.7-3.2 3.7 3.2c.9 2.6 1.3 5.6 1.3 9.6z" />
      <rect x="7.6" y="23.8" width="16.8" height="2.8" rx="1.1" />
      <rect x="7.2" y="26.2" width="17.6" height="3" rx="1.3" />
    </>
  ),
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const PROMOTIONS: PieceType[] = ['q', 'r', 'b', 'n']

function squareName(sq: number) {
  return `${FILES[fileOf(sq)]}${8 - rankOf(sq)}`
}

export default function ChessGame() {
  const { user } = useAccount()

  const [mode, setMode] = useState<'local' | 'online'>('local')
  const [game, setGame] = useState<ChessState>(initialGame)
  const [history, setHistory] = useState<ChessState[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [last, setLast] = useState<{ from: number; to: number } | null>(null)
  const [promoting, setPromoting] = useState<{ from: number; to: number } | null>(null)

  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [seat, setSeat] = useState<number | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const link = useRef<RoomLink | null>(null)

  useEffect(() => () => link.current?.close(), [])
  useEffect(() => {
    if (mode === 'local' && link.current) leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const online = mode === 'online'
  const board = online && room ? room.state : game
  const moves = useMemo(() => legalMoves(board), [board])
  const status = online && room ? room.status : statusOf(board, moves)
  const reason = status === 'draw' ? drawReason(board) : null
  const finished = status === 'checkmate' || status === 'stalemate' || status === 'draw'

  const myColor: Color | null = seat === 0 ? 'w' : seat === 1 ? 'b' : null
  const myTurn = !online || (myColor !== null && board.turn === myColor)

  const targets = useMemo(
    () => (selected === null ? [] : moves.filter((move) => move.from === selected)),
    [moves, selected],
  )

  const checking = inCheck(board)
  const kingSquare = checking
    ? board.board.findIndex((piece) => piece?.type === 'k' && piece.color === board.turn)
    : -1

  const opponent = room ? room.seats.find((entry) => entry.seat !== seat) : undefined

  function leave() {
    const current = link.current
    link.current = null
    current?.close()
    setRoom(null)
    setSeat(null)
    setSelected(null)
    setPromoting(null)
    setNotice(null)
  }

  function connect(code: string) {
    if (!user) {
      setNotice('Sign in to play online.')
      return
    }

    leave()
    setBusy(true)
    setNotice(null)

    link.current = joinRoom(code, user.idToken, {
      onOpen: () => setBusy(false),
      onSeat: (assigned, snapshot) => {
        setBusy(false)
        setSeat(assigned)
        setRoom(snapshot)
        if (assigned === null) setNotice('This room is full — you are watching as a spectator.')
      },
      onSnapshot: (snapshot, echo) => {
        setRoom(snapshot)
        if (echo) setLast({ from: echo.from, to: echo.to })
        setSelected(null)
        setPromoting(null)
      },
      onError: (message) => {
        setBusy(false)
        setNotice(message)
      },
      onClosed: () => {
        if (!link.current) return
        link.current = null
        setBusy(false)
        setNotice('Disconnected from the room.')
      },
    })
  }

  async function host() {
    if (!user) {
      setNotice('Sign in to play online.')
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      connect(await createRoom(user.idToken))
    } catch (error) {
      setBusy(false)
      setNotice(error instanceof Error ? error.message : 'Could not create a room')
    }
  }

  function join() {
    const code = joinCode.trim().toUpperCase()
    if (!/^[A-Z0-9]{5}$/.test(code)) {
      setNotice('Room codes are five characters.')
      return
    }
    connect(code)
  }

  function commit(from: number, to: number, promotion?: PieceType) {
    if (online) {
      link.current?.play(from, to, promotion)
      setSelected(null)
      setPromoting(null)
      return
    }

    const move = moves.find(
      (candidate) => candidate.from === from && candidate.to === to && (!promotion || candidate.promotion === promotion),
    )
    if (!move) return

    setHistory((past) => [...past, game])
    setGame(applyMove(game, move))
    setLast({ from, to })
    setSelected(null)
    setPromoting(null)
  }

  function onSquare(sq: number) {
    if (finished || !myTurn) return

    const target = targets.find((move) => move.to === sq)
    if (target && selected !== null) {
      if (targets.some((move) => move.to === sq && move.promotion)) {
        setPromoting({ from: selected, to: sq })
        return
      }
      commit(selected, sq)
      return
    }

    const piece = board.board[sq]
    setSelected(piece && piece.color === board.turn ? sq : null)
  }

  function undo() {
    setHistory((past) => {
      if (!past.length) return past
      setGame(past[past.length - 1])
      setLast(null)
      setSelected(null)
      return past.slice(0, -1)
    })
  }

  function restart() {
    setGame(initialGame())
    setHistory([])
    setSelected(null)
    setLast(null)
    setPromoting(null)
  }

  const side = board.turn === 'w' ? 'White' : 'Black'
  let label: string
  if (status === 'checkmate') {
    label = `${board.turn === 'w' ? 'Black' : 'White'} wins by checkmate`
  } else if (status === 'stalemate') {
    label = 'Draw — stalemate'
  } else if (status === 'draw') {
    label = `Draw — ${
      reason === 'fifty-move' ? 'fifty-move rule' : reason === 'threefold' ? 'threefold repetition' : 'insufficient material'
    }`
  } else if (online && room) {
    if (myColor === null) label = `${side} to move · spectating`
    else if (board.turn === myColor) label = status === 'check' ? 'Your move · check' : 'Your move'
    else label = `Waiting for ${board.turn === 'w' ? 'White' : 'Black'}`
  } else {
    label = status === 'check' ? `${side} to move · check` : `${side} to move`
  }

  return (
    <div className="ply-game chess">
      <div className="chess__modes" role="group" aria-label="Chess mode">
        <button
          type="button"
          className={`chess__mode${online ? '' : ' is-active'}`}
          aria-pressed={!online}
          onClick={() => setMode('local')}
        >
          Hot-seat
        </button>
        <button
          type="button"
          className={`chess__mode${online ? ' is-active' : ''}`}
          aria-pressed={online}
          onClick={() => setMode('online')}
        >
          Online
        </button>
      </div>

      {online && !user ? (
        <p className="chess__note">Sign in to play online. Hot-seat works without an account.</p>
      ) : null}

      {online && user && !room ? (
        <div className="chess__join">
          <button type="button" className="ply-btn is-primary" onClick={host} disabled={busy}>
            {busy ? 'Opening…' : 'Create room'}
          </button>
          <form
            className="chess__join-row"
            onSubmit={(event) => {
              event.preventDefault()
              join()
            }}
          >
            <input
              className="chess__join-input"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="CODE"
              aria-label="Room code"
              maxLength={5}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <button type="submit" className="ply-btn" disabled={busy || joinCode.trim().length !== 5}>
              Join
            </button>
          </form>
        </div>
      ) : null}

      {online && room ? (
        <div className="chess__room">
          <span className="chess__code">{room.code}</span>
          <span>{myColor ? `You are ${myColor === 'w' ? 'White' : 'Black'}` : 'Spectating'}</span>
          <span>
            {opponent?.name ? `${opponent.name} · ${opponent.online ? 'online' : 'away'}` : 'Waiting for an opponent'}
          </span>
          <button type="button" className="ply-btn" onClick={leave}>
            Leave
          </button>
        </div>
      ) : null}

      <p className={`ply-game__status${finished ? ' is-done' : ''}`}>{label}</p>

      <div className={`chess__board${finished ? ' is-finished' : ''}`} role="grid" aria-label="Chess board">
        {Array.from({ length: 64 }, (_, sq) => {
          const rank = rankOf(sq)
          const file = fileOf(sq)
          const piece = board.board[sq]
          const target = targets.find((move) => move.to === sq)
          const isCapture = Boolean(target && (board.board[sq] || target.enPassant))
          const classes = [
            'chess__square',
            (rank + file) % 2 === 0 ? 'is-light' : 'is-dark',
            selected === sq ? 'is-selected' : '',
            last && (last.from === sq || last.to === sq) ? 'is-last' : '',
            target ? 'is-target' : '',
            isCapture ? 'is-capture-target' : '',
            kingSquare === sq ? 'is-check' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={sq}
              type="button"
              role="gridcell"
              className={classes}
              aria-label={`${squareName(sq)}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
              onClick={() => onSquare(sq)}
            >
              {piece && (
                <svg
                  viewBox="0 0 32 32"
                  className={`chess__piece is-${piece.color}${last && last.to === sq ? ' is-arrived' : ''}`}
                  aria-hidden="true"
                >
                  {PIECE_SHAPES[piece.type]}
                </svg>
              )}
              {target && !isCapture && <span className="chess__dot" aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      {promoting ? (
        <div className="chess__promo" role="group" aria-label="Promote to">
          {PROMOTIONS.map((type) => (
            <button
              key={type}
              type="button"
              className="chess__promo-btn"
              aria-label={`Promote to ${type}`}
              onClick={() => commit(promoting.from, promoting.to, type)}
            >
              <svg viewBox="0 0 32 32" className="chess__piece is-w" aria-hidden="true">
                {PIECE_SHAPES[type]}
              </svg>
            </button>
          ))}
          <button type="button" className="chess__promo-cancel" onClick={() => setPromoting(null)}>
            Cancel
          </button>
        </div>
      ) : null}

      {notice ? <p className="chess__note">{notice}</p> : null}

      {online ? null : (
        <div className="ply-game__actions">
          <button type="button" className="ply-btn" onClick={restart}>
            New game
          </button>
          <button type="button" className="ply-btn" onClick={undo} disabled={!history.length}>
            Undo
          </button>
        </div>
      )}
    </div>
  )
}
