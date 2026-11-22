import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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
  type ChessStatus,
  type Color,
  type PieceType,
} from '@/lib/playables/chess'
import { createRoom, joinRoom, type RoomLink, type RoomSnapshot } from '@/lib/playables/rooms'
import { play } from '@/lib/playables/sound'
import { useAccount } from '@/hooks/use-account'

// Drawn as SVG rather than font glyphs: symbol fonts render chess pieces with
// wildly different weights and fall back inconsistently across machines.
// Font Awesome Free 6.7.2 chess icons, CC BY 4.0 (c) Fonticons, Inc.
// https://fontawesome.com/license/free - credit this set in the app's notices.
// The flat base, rounded heads and mitre slit match the reference set closely.
const PIECES: Record<PieceType, { width: number; d: string }> = {
  p: {
    width: 320,
    d: 'M215.5 224c29.2-18.4 48.5-50.9 48.5-88c0-57.4-46.6-104-104-104S56 78.6 56 136c0 37.1 19.4 69.6 48.5 88L96 224c-17.7 0-32 14.3-32 32c0 16.5 12.5 30 28.5 31.8L80 400l160 0L227.5 287.8c16-1.8 28.5-15.3 28.5-31.8c0-17.7-14.3-32-32-32l-8.5 0zM22.6 473.4c-4.2 4.2-6.6 10-6.6 16C16 501.9 26.1 512 38.6 512l242.7 0c12.5 0 22.6-10.1 22.6-22.6c0-6-2.4-11.8-6.6-16L256 432 64 432 22.6 473.4z',
  },
  r: {
    width: 448,
    d: 'M32 192L32 48c0-8.8 7.2-16 16-16l64 0c8.8 0 16 7.2 16 16l0 40c0 4.4 3.6 8 8 8l32 0c4.4 0 8-3.6 8-8l0-40c0-8.8 7.2-16 16-16l64 0c8.8 0 16 7.2 16 16l0 40c0 4.4 3.6 8 8 8l32 0c4.4 0 8-3.6 8-8l0-40c0-8.8 7.2-16 16-16l64 0c8.8 0 16 7.2 16 16l0 144c0 10.1-4.7 19.6-12.8 25.6L352 256l16 144L80 400 96 256 44.8 217.6C36.7 211.6 32 202.1 32 192zm176 96l32 0c8.8 0 16-7.2 16-16l0-48c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 48c0 8.8 7.2 16 16 16zM22.6 473.4L64 432l320 0 41.4 41.4c4.2 4.2 6.6 10 6.6 16c0 12.5-10.1 22.6-22.6 22.6L38.6 512C26.1 512 16 501.9 16 489.4c0-6 2.4-11.8 6.6-16z',
  },
  n: {
    width: 448,
    d: 'M96 48L82.7 61.3C70.7 73.3 64 89.5 64 106.5l0 132.4c0 10.7 5.3 20.7 14.2 26.6l10.6 7c14.3 9.6 32.7 10.7 48.1 3l3.2-1.6c2.6-1.3 5-2.8 7.3-4.5l49.4-37c6.6-5 15.7-5 22.3 0c10.2 7.7 9.9 23.1-.7 30.3L90.4 350C73.9 361.3 64 380 64 400l320 0 28.9-159c2.1-11.3 3.1-22.8 3.1-34.3l0-14.7C416 86 330 0 224 0L83.8 0C72.9 0 64 8.9 64 19.8c0 7.5 4.2 14.3 10.9 17.7L96 48zm24 68a20 20 0 1 1 40 0 20 20 0 1 1 -40 0zM22.6 473.4c-4.2 4.2-6.6 10-6.6 16C16 501.9 26.1 512 38.6 512l370.7 0c12.5 0 22.6-10.1 22.6-22.6c0-6-2.4-11.8-6.6-16L384 432 64 432 22.6 473.4z',
  },
  b: {
    width: 320,
    d: 'M128 0C110.3 0 96 14.3 96 32c0 16.1 11.9 29.4 27.4 31.7C78.4 106.8 8 190 8 288c0 47.4 30.8 72.3 56 84.7L64 400l192 0 0-27.3c25.2-12.5 56-37.4 56-84.7c0-37.3-10.2-72.4-25.3-104.1l-99.4 99.4c-6.2 6.2-16.4 6.2-22.6 0s-6.2-16.4 0-22.6L270.8 154.6c-23.2-38.1-51.8-69.5-74.2-90.9C212.1 61.4 224 48.1 224 32c0-17.7-14.3-32-32-32L128 0zM48 432L6.6 473.4c-4.2 4.2-6.6 10-6.6 16C0 501.9 10.1 512 22.6 512l274.7 0c12.5 0 22.6-10.1 22.6-22.6c0-6-2.4-11.8-6.6-16L272 432 48 432z',
  },
  q: {
    width: 512,
    d: 'M256 0a56 56 0 1 1 0 112A56 56 0 1 1 256 0zM134.1 143.8c3.3-13 15-23.8 30.2-23.8c12.3 0 22.6 7.2 27.7 17c12 23.2 36.2 39 64 39s52-15.8 64-39c5.1-9.8 15.4-17 27.7-17c15.3 0 27 10.8 30.2 23.8c7 27.8 32.2 48.3 62.1 48.3c10.8 0 21-2.7 29.8-7.4c8.4-4.4 18.9-4.5 27.6 .9c13 8 17.1 25 9.2 38L399.7 400 384 400l-40.4 0-175.1 0L128 400l-15.7 0L5.4 223.6c-7.9-13-3.8-30 9.2-38c8.7-5.3 19.2-5.3 27.6-.9c8.9 4.7 19 7.4 29.8 7.4c29.9 0 55.1-20.5 62.1-48.3zM256 224s0 0 0 0s0 0 0 0s0 0 0 0zM112 432l288 0 41.4 41.4c4.2 4.2 6.6 10 6.6 16c0 12.5-10.1 22.6-22.6 22.6L86.6 512C74.1 512 64 501.9 64 489.4c0-6 2.4-11.8 6.6-16L112 432z',
  },
  k: {
    width: 448,
    d: 'M224 0c17.7 0 32 14.3 32 32l0 16 16 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-16 0 0 48 152 0c22.1 0 40 17.9 40 40c0 5.3-1 10.5-3.1 15.4L368 400 80 400 3.1 215.4C1 210.5 0 205.3 0 200c0-22.1 17.9-40 40-40l152 0 0-48-16 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l16 0 0-16c0-17.7 14.3-32 32-32zM38.6 473.4L80 432l288 0 41.4 41.4c4.2 4.2 6.6 10 6.6 16c0 12.5-10.1 22.6-22.6 22.6L54.6 512C42.1 512 32 501.9 32 489.4c0-6 2.4-11.8 6.6-16z',
  },
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1]

// A piece fills 84% of its square, so one square of travel is 1/0.84 of the
// piece's own box; that is what a percentage translate needs.
const SQUARE_IN_PIECE_PERCENT = 100 / 0.84

const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315]

type LastMove = { from: number; to: number; ply: number; captured: number | null; promotion: PieceType | null }

type Slide = { x: number; y: number }

// Overlays are positioned by percentage, so they have to be placed in display
// space rather than board space once the board is turned around for Black.
function squareOffset(square: number, flipped: boolean) {
  const file = flipped ? 7 - fileOf(square) : fileOf(square)
  const rank = flipped ? 7 - rankOf(square) : rankOf(square)
  return { left: `${file * 12.5}%`, top: `${rank * 12.5}%` }
}

function Burst({ square, flipped }: { square: number; flipped: boolean }) {
  return (
    <span className="chess__burst" style={squareOffset(square, flipped)} aria-hidden="true">
      <span className="chess__flash" />
      {SPARKS.map((angle) => (
        <span
          key={angle}
          className="chess__spark"
          style={{ '--angle': `${angle}deg` } as CSSProperties}
        />
      ))}
    </span>
  )
}
/** Gold burst for a pawn that made it to the far rank. */
function Crown({ square, flipped }: { square: number; flipped: boolean }) {
  return (
    <span className="chess__crown" style={squareOffset(square, flipped)} aria-hidden="true">
      {SPARKS.map((angle) => (
        <span key={angle} className="chess__ray" style={{ '--angle': `${angle}deg` } as CSSProperties} />
      ))}
    </span>
  )
}

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
  const [last, setLast] = useState<LastMove | null>(null)
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
  const status: ChessStatus = online && room ? (room.status as ChessStatus) : statusOf(board, moves)
  const reason = status === 'draw' ? drawReason(board) : null
  const finished = status === 'checkmate' || status === 'stalemate' || status === 'draw'

  const myColor: Color | null = seat === 0 ? 'w' : seat === 1 ? 'b' : null
  const myTurn = !online || (myColor !== null && board.turn === myColor)

  // Online Black plays from the near side, so the board is turned 180°: squares
  // render in reverse order, the rank and file rails read the other way, and
  // slides travel in the opposite direction. Spectators keep White at the bottom.
  const flipped = online && myColor === 'b'

  const targets = useMemo(
    () => (selected === null ? [] : moves.filter((move) => move.from === selected)),
    [moves, selected],
  )

  // Which squares need a slide, and how far each piece travelled.
  const slides = useMemo(() => {
    const offsets = new Map<number, Slide>()
    if (!last) return offsets

    const dir = flipped ? -1 : 1
    offsets.set(last.to, {
      x: (fileOf(last.from) - fileOf(last.to)) * dir,
      y: (rankOf(last.from) - rankOf(last.to)) * dir,
    })

    // Castling moves two pieces; the rook slides as well.
    const moved = board.board[last.to]
    if (moved?.type === 'k' && Math.abs(fileOf(last.to) - fileOf(last.from)) === 2) {
      const kingSide = fileOf(last.to) > fileOf(last.from)
      const rookTo = kingSide ? last.to - 1 : last.to + 1
      const rookFrom = kingSide ? last.from + 3 : last.from - 4
      offsets.set(rookTo, { x: (fileOf(rookFrom) - fileOf(rookTo)) * dir, y: 0 })
    }

    return offsets
  }, [last, board, flipped])

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

    link.current = joinRoom<ChessState>(code, 'chess', user.idToken, {
      onOpen: () => setBusy(false),
      onSeat: (assigned, snapshot) => {
        setBusy(false)
        setSeat(assigned)
        setRoom(snapshot)
        if (assigned === null) setNotice('This room is full. You are watching as a spectator.')
      },
      onSnapshot: (snapshot, echo) => {
        setRoom(snapshot)
        if (echo) {
          setLast({
            from: echo.from,
            to: echo.to,
            ply: echo.ply,
            captured: echo.captured ?? null,
            promotion: echo.promotion ?? null,
          })
          if (echo.promotion) play('promote')
          else if (echo.captured != null) play('capture')
          else play('move')
          if (snapshot.status === 'checkmate') play('win')
          else if (snapshot.status === 'stalemate' || snapshot.status === 'draw') play('draw')
          else if (snapshot.status === 'check') play('check')
        }
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
      connect(await createRoom(user.idToken, 'chess'))
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
      link.current?.move({ from, to, promotion })
      setSelected(null)
      setPromoting(null)
      return
    }

    const move = moves.find(
      (candidate) => candidate.from === from && candidate.to === to && (!promotion || candidate.promotion === promotion),
    )
    if (!move) return

    const captured = move.capture ? (move.enPassant ? to + (game.turn === 'w' ? 8 : -8) : to) : null
    const promoted = move.promotion ?? null
    const next = applyMove(game, move)

    setHistory((past) => [...past, game])
    setGame(next)
    setLast({ from, to, ply: (last?.ply ?? 0) + 1, captured, promotion: promoted })
    setSelected(null)
    setPromoting(null)

    if (promoted) play('promote')
    else if (captured !== null) play('capture')
    else if (move.castle) play('castle')
    else play('move')

    const after = statusOf(next, legalMoves(next))
    if (after === 'checkmate') play('win')
    else if (after === 'stalemate' || after === 'draw') play('draw')
    else if (after === 'check') play('check')
  }

  function onSquare(sq: number) {
    if (finished || !myTurn) return

    const target = targets.find((move) => move.to === sq)
    if (target && selected !== null) {
      if (targets.some((move) => move.to === sq && move.promotion)) {
        setPromoting({ from: selected, to: sq })
        play('chime')
        return
      }
      commit(selected, sq)
      return
    }

    const piece = board.board[sq]
    const picked = piece && piece.color === board.turn ? sq : null
    if (picked !== null) play('select')
    setSelected(picked)
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
    label = 'Draw · stalemate'
  } else if (status === 'draw') {
    label = `Draw · ${
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

      <div className="chess__frame">
        <div className="chess__ranks" aria-hidden="true">
          {(flipped ? [...RANKS].reverse() : RANKS).map((rank) => (
            <span key={rank}>{rank}</span>
          ))}
        </div>

        <div className={`chess__board${finished ? ' is-finished' : ''}`} role="grid" aria-label="Chess board">
        {Array.from({ length: 64 }, (_, index) => {
          const sq = flipped ? 63 - index : index
          const rank = rankOf(sq)
          const file = fileOf(sq)
          const piece = board.board[sq]
          const slide = slides.get(sq)
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
                  viewBox="0 0 512 512"
                  className={`chess__piece is-${piece.color}${slide ? ' is-sliding' : ''}${
                    last && last.promotion && last.to === sq ? ' is-promoted' : ''
                  }`}
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
                  <g transform={`translate(${(512 - PIECES[piece.type].width) / 2} 0)`}>
                    <path d={PIECES[piece.type].d} />
                  </g>
                </svg>
              )}
              {target && !isCapture && <span className="chess__dot" aria-hidden="true" />}
            </button>
          )
        })}
          {last && last.captured !== null && (
            <Burst key={last.ply} square={last.captured} flipped={flipped} />
          )}
          {last && last.promotion !== null && (
            <Crown key={`crown-${last.ply}`} square={last.to} flipped={flipped} />
          )}
        </div>

        <div className="chess__files" aria-hidden="true">
          {(flipped ? [...FILES].reverse() : FILES).map((file) => (
            <span key={file}>{file}</span>
          ))}
        </div>
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
              <svg viewBox="0 0 512 512" className="chess__piece is-w" aria-hidden="true">
                <g transform={`translate(${(512 - PIECES[type].width) / 2} 0)`}>
                  <path d={PIECES[type].d} />
                </g>
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
