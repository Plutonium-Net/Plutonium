// Checkers rules, shared by the browser and the room Durable Object so the
// server can validate moves instead of trusting the client.
//
// English draughts: men move and capture forwards only, a capture is compulsory
// and as many pieces as possible must be taken, kings move both ways, and a man
// that reaches the far rank is crowned. A jump that can continue must continue,
// and crowning ends the turn.

export type CheckersColor = 'r' | 'b'
export type CheckersCell = { color: CheckersColor; king: boolean } | null
export type CheckersMove = { from: number; to: number; capture?: number }
export type CheckersStatus = 'playing' | 'won' | 'draw'
export type DrawReason = 'forty-move' | 'threefold'

export type CheckersState = {
  board: CheckersCell[]
  turn: CheckersColor
  /** Square that must keep jumping this turn, or null. */
  chain: number | null
  /** Set once the side to move has no legal move. */
  winner: CheckersColor | null
  /** Plies since the last capture or crowning, for the forty-move rule. */
  quiet: number
  /** Position keys, oldest first, including the current position. */
  history: string[]
}

const SIZE = 8

/** Full moves by each side without a capture or crowning before it is a draw. */
const QUIET_PLIES = 80

export const otherColor = (color: CheckersColor): CheckersColor => (color === 'r' ? 'b' : 'r')
export const rowOf = (sq: number) => Math.floor(sq / SIZE)
export const colOf = (sq: number) => sq % SIZE

export function initialBoard(): CheckersCell[] {
  const board: CheckersCell[] = Array(SIZE * SIZE).fill(null)
  for (let sq = 0; sq < SIZE * SIZE; sq += 1) {
    if ((rowOf(sq) + colOf(sq)) % 2 !== 1) continue
    if (rowOf(sq) < 3) board[sq] = { color: 'b', king: false }
    if (rowOf(sq) > 4) board[sq] = { color: 'r', king: false }
  }
  return board
}

export function positionKey(state: CheckersState): string {
  const cells = state.board
    .map((cell) => (cell ? (cell.king ? cell.color.toUpperCase() : cell.color) : '.'))
    .join('')
  return `${cells}|${state.turn}|${state.chain ?? '-'}`
}

export function initialGame(): CheckersState {
  const state: CheckersState = {
    board: initialBoard(),
    turn: 'r',
    chain: null,
    winner: null,
    quiet: 0,
    history: [],
  }
  return { ...state, history: [positionKey(state)] }
}

/** Every legal move for `color`; captures are compulsory. */
export function movesFor(board: CheckersCell[], color: CheckersColor, chain: number | null): CheckersMove[] {
  const captures: CheckersMove[] = []
  const steps: CheckersMove[] = []

  for (let sq = 0; sq < SIZE * SIZE; sq += 1) {
    if (chain !== null && sq !== chain) continue
    const piece = board[sq]
    if (!piece || piece.color !== color) continue

    const row = rowOf(sq)
    const col = colOf(sq)
    const rows = piece.king ? [-1, 1] : [color === 'r' ? -1 : 1]

    for (const dr of rows) {
      for (const dc of [-1, 1]) {
        const stepRow = row + dr
        const stepCol = col + dc
        if (stepRow < 0 || stepRow > 7 || stepCol < 0 || stepCol > 7) continue

        const step = stepRow * SIZE + stepCol
        if (!board[step]) steps.push({ from: sq, to: step })

        const jumpRow = row + dr * 2
        const jumpCol = col + dc * 2
        if (jumpRow < 0 || jumpRow > 7 || jumpCol < 0 || jumpCol > 7) continue

        const victim = board[step]
        const landing = jumpRow * SIZE + jumpCol
        if (victim && victim.color !== color && !board[landing]) {
          captures.push({ from: sq, to: landing, capture: step })
        }
      }
    }
  }

  return captures.length ? captures : steps
}

export function legalMoves(state: CheckersState): CheckersMove[] {
  return movesFor(state.board, state.turn, state.chain)
}

export function applyMove(state: CheckersState, move: CheckersMove): CheckersState {
  const board = state.board.slice()
  const piece = board[move.from]
  if (!piece) return state

  board[move.from] = null
  if (move.capture != null) board[move.capture] = null

  const crowned = (piece.color === 'r' && rowOf(move.to) === 0) || (piece.color === 'b' && rowOf(move.to) === 7)
  board[move.to] = { color: piece.color, king: piece.king || crowned }

  const captured = move.capture != null
  // Crowning ends the turn even when further jumps would be available.
  // movesFor() falls back to plain steps, so only jumps continue the chain.
  const further = captured && !crowned ? movesFor(board, piece.color, move.to).filter((next) => next.capture != null) : []
  const chain = further.length ? move.to : null
  const turn = chain === null ? otherColor(piece.color) : piece.color
  const stuck = chain === null && movesFor(board, turn, null).length === 0

  const next: CheckersState = {
    board,
    turn,
    chain,
    winner: stuck ? piece.color : null,
    quiet: captured || crowned ? 0 : state.quiet + 1,
    history: state.history,
  }
  next.history = [...state.history, positionKey(next)]
  return next
}

export function drawReason(state: CheckersState): DrawReason | null {
  if (state.winner) return null

  const key = positionKey(state)
  if (state.history.filter((entry) => entry === key).length >= 3) return 'threefold'
  if (state.quiet >= QUIET_PLIES) return 'forty-move'
  return null
}

/** Winner including the case where the side to move simply has no move left. */
export function winnerOf(state: CheckersState): CheckersColor | null {
  if (state.winner) return state.winner
  if (drawReason(state)) return null
  if (legalMoves(state).length === 0) return otherColor(state.turn)
  return null
}

export function statusOf(state: CheckersState): CheckersStatus {
  if (winnerOf(state)) return 'won'
  if (drawReason(state)) return 'draw'
  return 'playing'
}
