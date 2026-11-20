// Connect 4 rules, shared by the browser and the room Durable Object so the
// server can validate drops instead of trusting the client.
//
// The board is row-major with row 0 at the top, so dropping into a column means
// finding the lowest free row in it.

export const COLS = 7
export const ROWS = 6

export type Connect4Color = 'r' | 'y'
export type Connect4Cell = Connect4Color | null
export type Connect4Status = 'playing' | 'won' | 'draw'

export type Connect4State = {
  board: Connect4Cell[]
  turn: Connect4Color
  winner: Connect4Color | null
  draw: boolean
  /** Winning cells, empty unless someone has won. */
  line: number[]
}

export const otherColor = (color: Connect4Color): Connect4Color => (color === 'r' ? 'y' : 'r')

export function initialGame(): Connect4State {
  return { board: Array(COLS * ROWS).fill(null), turn: 'r', winner: null, draw: false, line: [] }
}

/** Lowest free cell in a column, or -1 when the column is full. */
export function dropCell(board: Connect4Cell[], col: number): number {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return -1
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    const cell = row * COLS + col
    if (!board[cell]) return cell
  }
  return -1
}

export function legalMoves(state: Connect4State): number[] {
  if (state.winner || state.draw) return []
  const columns: number[] = []
  for (let col = 0; col < COLS; col += 1) {
    if (dropCell(state.board, col) >= 0) columns.push(col)
  }
  return columns
}

export function winningLine(board: Connect4Cell[], cell: number, color: Connect4Color): number[] | null {
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
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === color) {
        line.push(r * COLS + c)
        r += dr * sign
        c += dc * sign
      }
    }
    if (line.length >= 4) return line
  }
  return null
}

export function applyMove(state: Connect4State, col: number): Connect4State {
  if (state.winner || state.draw) return state

  const cell = dropCell(state.board, col)
  if (cell < 0) return state

  const board = state.board.slice()
  board[cell] = state.turn

  const line = winningLine(board, cell, state.turn)
  const full = board.every(Boolean)

  return {
    board,
    // The turn only moves on if the game continues.
    turn: line || full ? state.turn : otherColor(state.turn),
    winner: line ? state.turn : null,
    draw: !line && full,
    line: line ?? [],
  }
}

export function statusOf(state: Connect4State): Connect4Status {
  if (state.winner) return 'won'
  if (state.draw) return 'draw'
  return 'playing'
}

/** Cell a drop lands on, for the move echo. */
export function landingCell(state: Connect4State, col: number): number {
  return dropCell(state.board, col)
}
