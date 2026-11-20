import { useMemo, useState } from 'react'
import { play as playSound } from '@/lib/playables/sound'

type Color = 'r' | 'b'
type Cell = { color: Color; king: boolean } | null
type Move = { from: number; to: number; capture?: number }

const other = (color: Color): Color => (color === 'r' ? 'b' : 'r')

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

  const moves = useMemo(() => (winner ? [] : movesFor(board, turn, chain)), [board, turn, chain, winner])
  const targets = useMemo(
    () => (selected === null ? [] : moves.filter((move) => move.from === selected)),
    [moves, selected],
  )

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
    setSelected(piece && piece.color === turn ? sq : null)
  }

  function restart() {
    setBoard(initialBoard())
    setTurn('r')
    setChain(null)
    setSelected(null)
    setWinner(null)
  }

  const label = winner
    ? `${winner === 'r' ? 'Red' : 'Black'} wins`
    : `${turn === 'r' ? 'Red' : 'Black'} to move${chain !== null ? ' · keep jumping' : ''}`

  return (
    <div className="ply-game checkers">
      <p className={`ply-game__status${winner ? ' is-done' : ''}`}>{label}</p>

      <div className="checkers__board" role="grid" aria-label="Checkers board">
        {Array.from({ length: 64 }, (_, sq) => {
          const row = Math.floor(sq / 8)
          const col = sq % 8
          const playable = (row + col) % 2 === 1
          const piece = board[sq]
          const isTarget = targets.some((move) => move.to === sq)
          const classes = [
            'checkers__square',
            playable ? 'is-playable' : 'is-light',
            selected === sq ? 'is-selected' : '',
            isTarget ? 'is-target' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={sq}
              type="button"
              role="gridcell"
              className={classes}
              aria-label={`Square ${col + 1}, ${8 - row}${piece ? ` ${piece.color === 'r' ? 'red' : 'black'} piece` : ''}`}
              onClick={() => onSquare(sq)}
              disabled={!playable}
            >
              {piece && (
                <span className={`checkers__piece is-${piece.color}${piece.king ? ' is-king' : ''}`} aria-hidden="true">
                  {piece.king ? '♛' : ''}
                </span>
              )}
              {isTarget && <span className="checkers__dot" aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      <div className="ply-game__actions">
        <button type="button" className="ply-btn" onClick={restart}>
          New game
        </button>
      </div>
    </div>
  )
}
