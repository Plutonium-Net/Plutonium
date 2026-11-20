import { useMemo, useState, type CSSProperties } from 'react'
import { play as playSound } from '@/lib/playables/sound'

type Color = 'r' | 'b'
type Cell = { color: Color; king: boolean } | null
type Move = { from: number; to: number; capture?: number }

const other = (color: Color): Color => (color === 'r' ? 'b' : 'r')
const rowOf = (sq: number) => Math.floor(sq / 8)
const colOf = (sq: number) => sq % 8

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
  color: Color
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

function initialBoard(): Cell[] {
  const board: Cell[] = Array(64).fill(null)
  for (let sq = 0; sq < 64; sq += 1) {
    const row = Math.floor(sq / 8)
    const col = sq % 8
    if ((row + col) % 2 !== 1) continue
    if (row < 3) board[sq] = { color: 'b', king: false }
    if (row > 4) board[sq] = { color: 'r', king: false }
  }
  return board
}

function movesFor(board: Cell[], color: Color, chain: number | null): Move[] {
  const captures: Move[] = []
  const steps: Move[] = []

  for (let sq = 0; sq < 64; sq += 1) {
    if (chain !== null && sq !== chain) continue
    const piece = board[sq]
    if (!piece || piece.color !== color) continue
    const row = Math.floor(sq / 8)
    const col = sq % 8
    const rows = piece.king ? [-1, 1] : [color === 'r' ? -1 : 1]

    for (const dr of rows) {
      for (const dc of [-1, 1]) {
        const stepRow = row + dr
        const stepCol = col + dc
        if (stepRow < 0 || stepRow > 7 || stepCol < 0 || stepCol > 7) continue
        const step = stepRow * 8 + stepCol
        if (!board[step]) steps.push({ from: sq, to: step })

        const jumpRow = row + dr * 2
        const jumpCol = col + dc * 2
        if (jumpRow < 0 || jumpRow > 7 || jumpCol < 0 || jumpCol > 7) continue
        const victim = board[step]
        const landing = jumpRow * 8 + jumpCol
        if (victim && victim.color !== color && !board[landing]) {
          captures.push({ from: sq, to: landing, capture: step })
        }
      }
    }
  }

  return captures.length ? captures : steps
}

function applyMove(board: Cell[], move: Move): Cell[] {
  const next = board.slice()
  const piece = next[move.from]
  if (!piece) return next
  next[move.from] = null
  if (move.capture != null) next[move.capture] = null
  const row = Math.floor(move.to / 8)
  const promoted = piece.color === 'r' ? row === 0 : row === 7
  next[move.to] = { color: piece.color, king: piece.king || promoted }
  return next
}

export default function CheckersGame() {
  const [board, setBoard] = useState<Cell[]>(initialBoard)
  const [turn, setTurn] = useState<Color>('r')
  const [chain, setChain] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [winner, setWinner] = useState<Color | null>(null)
  const [last, setLast] = useState<LastMove | null>(null)

  const moves = useMemo(() => (winner ? [] : movesFor(board, turn, chain)), [board, turn, chain, winner])
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

  function play(move: Move) {
    const piece = board[move.from]
    const wasKing = !!piece?.king
    const next = applyMove(board, move)
    const nowKing = !!next[move.to]?.king
    const further = move.capture != null && !(nowKing && !wasKing) ? movesFor(next, turn, move.to) : []
    const keepTurn = further.some((candidate) => candidate.capture != null)
    const nextTurn = keepTurn ? turn : other(turn)

    setBoard(next)
    setSelected(keepTurn ? move.to : null)
    setChain(keepTurn ? move.to : null)
    setTurn(nextTurn)
    setLast({
      from: move.from,
      to: move.to,
      captured: move.capture ?? null,
      ply: (last?.ply ?? 0) + 1,
      kinged: nowKing && !wasKing,
    })

    playSound(move.capture != null ? 'capture' : 'move')
    if (nowKing && !wasKing) playSound('promote')
    if (!keepTurn && movesFor(next, nextTurn, null).length === 0) {
      setWinner(turn)
      playSound('win')
    }
  }

  function onSquare(sq: number) {
    if (winner) return
    const target = targets.find((move) => move.to === sq)
    if (target) {
      play(target)
      return
    }
    if (chain !== null) return
    const piece = board[sq]
    const picked = piece && piece.color === turn ? sq : null
    if (picked !== null) playSound('select')
    setSelected(picked)
  }

  function restart() {
    setBoard(initialBoard())
    setTurn('r')
    setChain(null)
    setSelected(null)
    setWinner(null)
    setLast(null)
  }

  const label = winner
    ? `${winner === 'r' ? 'Red' : 'Black'} wins`
    : `${turn === 'r' ? 'Red' : 'Black'} to move${chain !== null ? ' · keep jumping' : ''}`

  return (
    <div className="ply-game checkers">
      <p className={`ply-game__status${winner ? ' is-done' : ''}`}>{label}</p>

      <div className="checkers__board" role="grid" aria-label="Checkers board">
        {Array.from({ length: 64 }, (_, sq) => {
          const row = rowOf(sq)
          const col = colOf(sq)
          const playable = (row + col) % 2 === 1
          const piece = board[sq]
          const slide = slides.get(sq)
          const isTarget = targets.some((move) => move.to === sq)
          const isCaptureTarget = targets.some((move) => move.to === sq && move.capture != null)
          const classes = [
            'checkers__square',
            playable ? 'is-playable' : 'is-light',
            last && (last.from === sq || last.to === sq) ? 'is-last' : '',
            selected === sq ? 'is-selected' : '',
            isTarget ? 'is-target' : '',
            isTarget && !isCaptureTarget ? 'is-step' : '',
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
              {isTarget && !isCaptureTarget && <span className="checkers__dot" aria-hidden="true" />}
            </button>
          )
        })}
        {last && last.captured !== null && <Burst key={last.ply} square={last.captured} />}
        {last && last.kinged && <Crown key={`crown-${last.ply}`} square={last.to} />}
      </div>

      <div className="ply-game__actions">
        <button type="button" className="ply-btn" onClick={restart}>
          New game
        </button>
      </div>
    </div>
  )
}
