import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  applyMove,
  colOf,
  drawReason,
  initialGame,
  legalMoves,
  otherColor,
  rowOf,
  statusOf,
  winnerOf,
  type CheckersColor,
  type CheckersState,
} from '@/lib/playables/checkers'
import { createRoom, joinRoom, type RoomLink, type RoomSnapshot } from '@/lib/playables/rooms'
import { useAccount } from '@/hooks/use-account'
import { play as playSound } from '@/lib/playables/sound'

// The disc fills 76% of its square, so one square of travel is 1/0.76 of the
// piece's own box; that is what a percentage translate needs.
const SQUARE_IN_PIECE_PERCENT = 100 / 0.76

const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315]

// Drawn as SVG rather than a glyph: the crown symbol falls back to whatever
// font the machine has, which is how the old king ended up a different shape on
// every platform. Same flat silhouette language as the chess pieces.
const CROWN = 'M168 318 L176 202 L214 248 L256 182 L298 248 L336 202 L344 318 Z'
const CROWN_BASE = 'M164 330 h184 a14 14 0 0 1 0 28 h-184 a14 14 0 0 1 0 -28 z'

type LastMove = { from: number; to: number; captured: number | null; ply: number; kinged: boolean }

type Slide = { x: number; y: number }

function Piece({
  color,
  king,
  slide,
  kinged,
}: {
  color: CheckersColor
  king: boolean
  slide?: Slide
  kinged?: boolean
}) {
  const classes = [
    'checkers__piece',
    `is-${color}`,
    slide ? 'is-sliding' : '',
    kinged ? 'is-kinged' : '',
    king ? 'is-king' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <svg
      viewBox="0 0 512 512"
      className={classes}
      style={
        slide
          ? ({
              '--slide-x': `${slide.x * SQUARE_IN_PIECE_PERCENT}%`,
              '--slide-y': `${slide.y * SQUARE_IN_PIECE_PERCENT}%`,
            } as CSSProperties)
          : undefined
      }
      aria-hidden="true"
    >
      <circle className="checkers__body" cx="256" cy="256" r="238" fill="currentColor" />
      <circle cx="256" cy="256" r="194" fill="none" stroke="rgba(255, 255, 255, 0.16)" strokeWidth="16" />
      <circle cx="256" cy="256" r="152" fill="none" stroke="rgba(0, 0, 0, 0.16)" strokeWidth="12" />
      {king && (
        <g fill="rgba(255, 243, 214, 0.94)">
          <path d={CROWN} />
          <path d={CROWN_BASE} />
        </g>
      )}
    </svg>
  )
}

function Burst({ square }: { square: number }) {
  return (
    <span
      className="checkers__burst"
      style={{ left: `${colOf(square) * 12.5}%`, top: `${rowOf(square) * 12.5}%` }}
      aria-hidden="true"
    >
      <span className="checkers__flash" />
      {SPARKS.map((angle) => (
        <span key={angle} className="checkers__spark" style={{ '--angle': `${angle}deg` } as CSSProperties} />
      ))}
    </span>
  )
}

function Crown({ square }: { square: number }) {
  return (
    <span
      className="checkers__crown"
      style={{ left: `${colOf(square) * 12.5}%`, top: `${rowOf(square) * 12.5}%` }}
      aria-hidden="true"
    >
      {SPARKS.map((angle) => (
        <span key={angle} className="checkers__ray" style={{ '--angle': `${angle}deg` } as CSSProperties} />
      ))}
    </span>
  )
}

export default function CheckersGame() {
  const { user } = useAccount()

  const [mode, setMode] = useState<'local' | 'online'>('local')
  const [game, setGame] = useState<CheckersState>(initialGame)
  const [selected, setSelected] = useState<number | null>(null)
  const [last, setLast] = useState<LastMove | null>(null)

  const [room, setRoom] = useState<RoomSnapshot<CheckersState> | null>(null)
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
  const status = online && room ? room.status : statusOf(board)
  const won = winnerOf(board)
  const reason = drawReason(board)
  const finished = won !== null || reason !== null

  const myColor: CheckersColor | null = seat === 0 ? 'r' : seat === 1 ? 'b' : null
  const myTurn = !online || (myColor !== null && board.turn === myColor)

  const targets = useMemo(
    () => (selected === null ? [] : moves.filter((move) => move.from === selected)),
    [moves, selected],
  )

  const slides = useMemo(() => {
    const offsets = new Map<number, Slide>()
    if (!last) return offsets
    offsets.set(last.to, { x: colOf(last.from) - colOf(last.to), y: rowOf(last.from) - rowOf(last.to) })
    return offsets
  }, [last])

  const opponent = room ? room.seats.find((entry) => entry.seat !== seat) : undefined

  function leave() {
    const current = link.current
    link.current = null
    current?.close()
    setRoom(null)
    setSeat(null)
    setSelected(null)
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

    link.current = joinRoom<CheckersState>(code, 'checkers', user.idToken, {
      onOpen: () => setBusy(false),
      onSeat: (assigned, snapshot) => {
        setBusy(false)
        setSeat(assigned)
        setRoom(snapshot)
        if (assigned === null) setNotice('This room is full — you are watching as a spectator.')
      },
      onSnapshot: (snapshot, echo) => {
        setRoom(snapshot)
        if (echo) {
          setLast({
            from: echo.from,
            to: echo.to,
            captured: echo.captured ?? null,
            ply: echo.ply,
            kinged: Boolean(echo.kinged),
          })
          if (echo.kinged) playSound('promote')
          else if (echo.captured != null) playSound('capture')
          else playSound('move')
          if (snapshot.status === 'won') playSound('win')
          else if (snapshot.status === 'draw') playSound('draw')
        }
        setSelected(null)
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
      connect(await createRoom(user.idToken, 'checkers'))
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

  function commit(from: number, to: number) {
    if (online) {
      link.current?.move({ from, to })
      setSelected(null)
      return
    }

    const move = moves.find((candidate) => candidate.from === from && candidate.to === to)
    if (!move) return

    const before = board.board[from]
    const next = applyMove(board, move)
    const kinged = Boolean(before && next.board[to]?.king && !before.king)

    setGame(next)
    setSelected(next.chain)
    setLast({ from, to, captured: move.capture ?? null, ply: (last?.ply ?? 0) + 1, kinged })

    if (kinged) playSound('promote')
    else playSound(move.capture != null ? 'capture' : 'move')

    if (winnerOf(next)) playSound('win')
    else if (drawReason(next)) playSound('draw')
  }

  function onSquare(sq: number) {
    if (finished || !myTurn) return

    const target = targets.find((move) => move.to === sq)
    if (target) {
      commit(target.from, target.to)
      return
    }
    if (board.chain !== null) return

    const piece = board.board[sq]
    const picked = piece && piece.color === board.turn ? sq : null
    if (picked !== null) playSound('select')
    setSelected(picked)
  }

  function restart() {
    setGame(initialGame())
    setSelected(null)
    setLast(null)
  }

  const side = board.turn === 'r' ? 'Red' : 'Black'
  let label: string
  if (won) {
    label = `${won === 'r' ? 'Red' : 'Black'} wins`
  } else if (reason === 'threefold') {
    label = 'Draw — threefold repetition'
  } else if (reason === 'forty-move') {
    label = 'Draw — 40 moves without a capture'
  } else if (online && room) {
    if (myColor === null) label = `${side} to move · spectating`
    else if (board.turn === myColor) label = board.chain !== null ? 'Your move · keep jumping' : 'Your move'
    else label = `Waiting for ${side}`
  } else {
    label = `${side} to move${board.chain !== null ? ' · keep jumping' : ''}`
  }

  return (
    <div className="ply-game checkers">
      <div className="checkers__modes" role="group" aria-label="Checkers mode">
        <button
          type="button"
          className={`checkers__mode${online ? '' : ' is-active'}`}
          aria-pressed={!online}
          onClick={() => setMode('local')}
        >
          Hot-seat
        </button>
        <button
          type="button"
          className={`checkers__mode${online ? ' is-active' : ''}`}
          aria-pressed={online}
          onClick={() => setMode('online')}
        >
          Online
        </button>
      </div>

      {online && !user ? (
        <p className="checkers__note">Sign in to play online. Hot-seat works without an account.</p>
      ) : null}

      {online && user && !room ? (
        <div className="checkers__join">
          <button type="button" className="ply-btn is-primary" onClick={host} disabled={busy}>
            {busy ? 'Opening…' : 'Create room'}
          </button>
          <form
            className="checkers__join-row"
            onSubmit={(event) => {
              event.preventDefault()
              join()
            }}
          >
            <input
              className="checkers__join-input"
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
        <div className="checkers__room">
          <span className="checkers__code">{room.code}</span>
          <span>{myColor ? `You are ${myColor === 'r' ? 'Red' : 'Black'}` : 'Spectating'}</span>
          <span>
            {opponent?.name ? `${opponent.name} · ${opponent.online ? 'online' : 'away'}` : 'Waiting for an opponent'}
          </span>
          <button type="button" className="ply-btn" onClick={leave}>
            Leave
          </button>
        </div>
      ) : null}

      <p className={`ply-game__status${finished ? ' is-done' : ''}`}>{label}</p>

      <div className="checkers__board" role="grid" aria-label="Checkers board">
        {Array.from({ length: 64 }, (_, sq) => {
          const row = rowOf(sq)
          const col = colOf(sq)
          const playable = (row + col) % 2 === 1
          const piece = board.board[sq]
          const slide = slides.get(sq)
          const target = targets.find((move) => move.to === sq)
          const isCapture = Boolean(target && target.capture != null)
          const classes = [
            'checkers__square',
            playable ? 'is-playable' : 'is-light',
            last && (last.from === sq || last.to === sq) ? 'is-last' : '',
            selected === sq ? 'is-selected' : '',
            target ? 'is-target' : '',
            target && !isCapture ? 'is-step' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={sq}
              type="button"
              role="gridcell"
              className={classes}
              aria-label={`Square ${col + 1}, ${8 - row}${
                piece ? ` ${piece.color === 'r' ? 'red' : 'black'}${piece.king ? ' king' : ' piece'}` : ''
              }`}
              onClick={() => onSquare(sq)}
              disabled={!playable}
            >
              {piece && (
                <Piece
                  color={piece.color}
                  king={piece.king}
                  slide={slide}
                  kinged={Boolean(last?.kinged && last.to === sq)}
                />
              )}
              {target && !isCapture && <span className="checkers__dot" aria-hidden="true" />}
            </button>
          )
        })}
        {last && last.captured !== null && <Burst key={last.ply} square={last.captured} />}
        {last && last.kinged && <Crown key={`crown-${last.ply}`} square={last.to} />}
      </div>

      {notice ? <p className="checkers__note">{notice}</p> : null}

      {online ? null : (
        <div className="ply-game__actions">
          <button type="button" className="ply-btn" onClick={restart}>
            New game
          </button>
        </div>
      )}
    </div>
  )
}
