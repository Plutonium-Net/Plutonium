import { useState } from 'react'
import { play } from '@/lib/playables/sound'

const COLS = 7
const ROWS = 6

type Disc = 'r' | 'y' | null
type Result = { winner: Disc | 'draw'; line: number[] } | null

function emptyBoard(): Disc[] {
  return Array(COLS * ROWS).fill(null)
}

function winningLine(board: Disc[], cell: number, disc: Exclude<Disc, null>): number[] | null {
  const row = Math.floor(cell / COLS)
  const col = cell % COLS
  const directions: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]

  for (const [dr, dc] of directions) {
    const line = [cell]
    for (const sign of [-1, 1]) {
      let r = row + dr * sign
      let c = col + dc * sign
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === disc) {
        line.push(r * COLS + c)
        r += dr * sign
        c += dc * sign
      }
    }
    if (line.length >= 4) return line
  }
  return null
}

export default function Connect4Game() {
  const [board, setBoard] = useState<Disc[]>(emptyBoard)
  const [turn, setTurn] = useState<Exclude<Disc, null>>('r')
  const [result, setResult] = useState<Result>(null)
  const [last, setLast] = useState<number | null>(null)

  function drop(col: number) {
    if (result) return
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      const cell = row * COLS + col
      if (board[cell]) continue
      const next = board.slice()
      next[cell] = turn
      setBoard(next)
      setLast(cell)
      play('drop')
      const line = winningLine(next, cell, turn)
      if (line) {
        setResult({ winner: turn, line })
        play('win')
      } else if (next.every(Boolean)) {
        setResult({ winner: 'draw', line: [] })
        play('draw')
      } else setTurn(turn === 'r' ? 'y' : 'r')
      return
    }
  }

  function restart() {
    setBoard(emptyBoard())
    setTurn('r')
    setResult(null)
    setLast(null)
  }

  const label = result
    ? result.winner === 'draw'
      ? 'Draw — the board is full'
      : `${result.winner === 'r' ? 'Red' : 'Yellow'} wins`
    : `${turn === 'r' ? 'Red' : 'Yellow'} to move`

  return (
    <div className="ply-game c4">
      <p className={`ply-game__status${result ? ' is-done' : ''}`}>{label}</p>

      <div className="c4__board">
        <div className="c4__grid">
          {Array.from({ length: ROWS * COLS }, (_, cell) => {
            const disc = board[cell]
            const inLine = result?.line.includes(cell)
            return (
              <button
                key={cell}
                type="button"
                className={`c4__cell${inLine ? ' is-win' : ''}${last === cell ? ' is-last' : ''}`}
                aria-label={`Column ${(cell % COLS) + 1}, row ${ROWS - Math.floor(cell / COLS)}`}
                onClick={() => drop(cell % COLS)}
              />
            )
          })}
          {Array.from({ length: ROWS * COLS }, (_, cell) => {
            const disc = board[cell]
            if (!disc) return null
            return (
              <span
                key={`disc-${cell}`}
                className={`c4__disc is-${disc}${last === cell ? ' is-last' : ''}${
                  result?.line.includes(cell) ? ' is-win' : ''
                }`}
                style={{ gridRow: Math.floor(cell / COLS) + 1, gridColumn: (cell % COLS) + 1 }}
                aria-hidden="true"
              />
            )
          })}
        </div>
      </div>

      <div className="ply-game__actions">
        <button type="button" className="ply-btn" onClick={restart}>
          New game
        </button>
      </div>
    </div>
  )
}
