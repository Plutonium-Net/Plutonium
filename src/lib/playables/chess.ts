export type Color = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type Piece = { color: Color; type: PieceType }
export type Square = number
export type Board = Array<Piece | null>
export type Castling = { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean }

export type Move = {
  from: Square
  to: Square
  piece: PieceType
  capture?: PieceType
  promotion?: PieceType
  castle?: 'K' | 'Q'
  enPassant?: boolean
}

export type ChessState = {
  board: Board
  turn: Color
  castling: Castling
  ep: Square | null
  halfmove: number
  fullmove: number
  /** Position keys for every position reached in this game, current one last. */
  history?: string[]
}

export type ChessStatus = 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw'

export type DrawReason = 'insufficient-material' | 'fifty-move' | 'threefold'

const PROMOTIONS: PieceType[] = ['q', 'r', 'b', 'n']

const BACK_RANK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']

const KNIGHT_STEPS: ReadonlyArray<readonly [number, number]> = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
]

const KING_STEPS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

const BISHOP_STEPS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

const ROOK_STEPS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

export const other = (color: Color): Color => (color === 'w' ? 'b' : 'w')

export const fileOf = (sq: Square) => sq % 8
export const rankOf = (sq: Square) => Math.floor(sq / 8)

function squareAt(rank: number, file: number) {
  if (rank < 0 || rank > 7 || file < 0 || file > 7) return -1
  return rank * 8 + file
}

function pieceAt(board: Board, rank: number, file: number): Piece | null {
  const sq = squareAt(rank, file)
  return sq === -1 ? null : board[sq]
}

export function initialGame(): ChessState {
  const board: Board = Array(64).fill(null)
  for (let file = 0; file < 8; file += 1) {
    board[file] = { color: 'b', type: BACK_RANK[file] }
    board[8 + file] = { color: 'b', type: 'p' }
    board[48 + file] = { color: 'w', type: 'p' }
    board[56 + file] = { color: 'w', type: BACK_RANK[file] }
  }
  const game: ChessState = {
    board,
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    ep: null,
    halfmove: 0,
    fullmove: 1,
    history: [],
  }
  game.history = [positionKey(game)]
  return game
}

export function findKing(board: Board, color: Color) {
  for (let sq = 0; sq < 64; sq += 1) {
    const piece = board[sq]
    if (piece && piece.type === 'k' && piece.color === color) return sq
  }
  return -1
}

export function isAttacked(board: Board, sq: Square, by: Color) {
  const rank = rankOf(sq)
  const file = fileOf(sq)

  const pawnRank = rank + (by === 'w' ? 1 : -1)
  for (const dc of [-1, 1]) {
    const piece = pieceAt(board, pawnRank, file + dc)
    if (piece && piece.color === by && piece.type === 'p') return true
  }

  for (const [dr, dc] of KNIGHT_STEPS) {
    const piece = pieceAt(board, rank + dr, file + dc)
    if (piece && piece.color === by && piece.type === 'n') return true
  }

  for (const [dr, dc] of KING_STEPS) {
    const piece = pieceAt(board, rank + dr, file + dc)
    if (piece && piece.color === by && piece.type === 'k') return true
  }

  for (const [dr, dc] of BISHOP_STEPS) {
    let r = rank + dr
    let c = file + dc
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const piece = board[r * 8 + c]
      if (!piece) {
        r += dr
        c += dc
        continue
      }
      if (piece.color === by && (piece.type === 'b' || piece.type === 'q')) return true
      break
    }
  }

  for (const [dr, dc] of ROOK_STEPS) {
    let r = rank + dr
    let c = file + dc
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const piece = board[r * 8 + c]
      if (!piece) {
        r += dr
        c += dc
        continue
      }
      if (piece.color === by && (piece.type === 'r' || piece.type === 'q')) return true
      break
    }
  }

  return false
}

export function pseudoMoves(state: ChessState, color: Color): Move[] {
  const { board } = state
  const moves: Move[] = []

  const pushPawn = (from: Square, to: Square, capture?: PieceType) => {
    const promotionRank = color === 'w' ? 0 : 7
    if (rankOf(to) === promotionRank) {
      for (const promotion of PROMOTIONS) moves.push({ from, to, piece: 'p', capture, promotion })
    } else {
      moves.push({ from, to, piece: 'p', capture })
    }
  }

  const slide = (from: Square, rank: number, file: number, steps: ReadonlyArray<readonly [number, number]>, piece: PieceType) => {
    for (const [dr, dc] of steps) {
      let r = rank + dr
      let c = file + dc
      while (true) {
        const target = squareAt(r, c)
        if (target === -1) break
        const occupant = board[target]
        if (!occupant) {
          moves.push({ from, to: target, piece })
        } else {
          if (occupant.color !== color) moves.push({ from, to: target, piece, capture: occupant.type })
          break
        }
        r += dr
        c += dc
      }
    }
  }

  for (let sq = 0; sq < 64; sq += 1) {
    const piece = board[sq]
    if (!piece || piece.color !== color) continue
    const rank = rankOf(sq)
    const file = fileOf(sq)

    if (piece.type === 'p') {
      const dir = color === 'w' ? -1 : 1
      const startRank = color === 'w' ? 6 : 1
      const one = squareAt(rank + dir, file)
      if (one !== -1 && !board[one]) {
        pushPawn(sq, one)
        const two = squareAt(rank + dir * 2, file)
        if (rank === startRank && two !== -1 && !board[two]) moves.push({ from: sq, to: two, piece: 'p' })
      }
      for (const dc of [-1, 1]) {
        const target = squareAt(rank + dir, file + dc)
        if (target === -1) continue
        const occupant = board[target]
        if (occupant && occupant.color !== color) pushPawn(sq, target, occupant.type)
        else if (!occupant && state.ep === target) moves.push({ from: sq, to: target, piece: 'p', capture: 'p', enPassant: true })
      }
      continue
    }

    if (piece.type === 'n') {
      for (const [dr, dc] of KNIGHT_STEPS) {
        const target = squareAt(rank + dr, file + dc)
        if (target === -1) continue
        const occupant = board[target]
        if (!occupant) moves.push({ from: sq, to: target, piece: 'n' })
        else if (occupant.color !== color) moves.push({ from: sq, to: target, piece: 'n', capture: occupant.type })
      }
      continue
    }

    if (piece.type === 'b') {
      slide(sq, rank, file, BISHOP_STEPS, 'b')
      continue
    }

    if (piece.type === 'r') {
      slide(sq, rank, file, ROOK_STEPS, 'r')
      continue
    }

    if (piece.type === 'q') {
      slide(sq, rank, file, BISHOP_STEPS, 'q')
      slide(sq, rank, file, ROOK_STEPS, 'q')
      continue
    }

    for (const [dr, dc] of KING_STEPS) {
      const target = squareAt(rank + dr, file + dc)
      if (target === -1) continue
      const occupant = board[target]
      if (!occupant) moves.push({ from: sq, to: target, piece: 'k' })
      else if (occupant.color !== color) moves.push({ from: sq, to: target, piece: 'k', capture: occupant.type })
    }

    const home = color === 'w' ? 60 : 4
    if (sq === home && !isAttacked(board, home, other(color))) {
      const kingSide = color === 'w' ? state.castling.wK : state.castling.bK
      const queenSide = color === 'w' ? state.castling.wQ : state.castling.bQ
      const rookKing = board[home + 3]
      const rookQueen = board[home - 4]
      if (
        kingSide &&
        rookKing?.type === 'r' &&
        rookKing.color === color &&
        !board[home + 1] &&
        !board[home + 2] &&
        !isAttacked(board, home + 1, other(color)) &&
        !isAttacked(board, home + 2, other(color))
      ) {
        moves.push({ from: sq, to: home + 2, piece: 'k', castle: 'K' })
      }
      if (
        queenSide &&
        rookQueen?.type === 'r' &&
        rookQueen.color === color &&
        !board[home - 1] &&
        !board[home - 2] &&
        !board[home - 3] &&
        !isAttacked(board, home - 1, other(color)) &&
        !isAttacked(board, home - 2, other(color))
      ) {
        moves.push({ from: sq, to: home - 2, piece: 'k', castle: 'Q' })
      }
    }
  }

  return moves
}

function applyMoveRaw(state: ChessState, move: Move): ChessState {
  const board = state.board.map((piece) => (piece ? { ...piece } : null))
  const piece = board[move.from]
  if (!piece) return state

  board[move.from] = null

  if (move.enPassant) {
    const capturedSq = squareAt(rankOf(move.to) + (piece.color === 'w' ? 1 : -1), fileOf(move.to))
    if (capturedSq !== -1) board[capturedSq] = null
  }

  board[move.to] = move.promotion ? { color: piece.color, type: move.promotion } : piece

  if (move.castle) {
    const rank = rankOf(move.from)
    if (move.castle === 'K') {
      board[squareAt(rank, 5)] = board[squareAt(rank, 7)]
      board[squareAt(rank, 7)] = null
    } else {
      board[squareAt(rank, 3)] = board[squareAt(rank, 0)]
      board[squareAt(rank, 0)] = null
    }
  }

  const castling = { ...state.castling }
  const clearRights = (sq: Square) => {
    if (sq === 60) {
      castling.wK = false
      castling.wQ = false
    }
    if (sq === 4) {
      castling.bK = false
      castling.bQ = false
    }
    if (sq === 63) castling.wK = false
    if (sq === 56) castling.wQ = false
    if (sq === 7) castling.bK = false
    if (sq === 0) castling.bQ = false
  }
  clearRights(move.from)
  clearRights(move.to)

  const doubleStep = piece.type === 'p' && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2
  const ep = doubleStep ? squareAt((rankOf(move.from) + rankOf(move.to)) / 2, fileOf(move.from)) : null

  const captured = !!move.capture

  return {
    board,
    turn: other(state.turn),
    castling,
    ep,
    halfmove: piece.type === 'p' || captured ? 0 : state.halfmove + 1,
    fullmove: state.turn === 'b' ? state.fullmove + 1 : state.fullmove,
  }
}

export function inCheck(state: ChessState) {
  const king = findKing(state.board, state.turn)
  return king !== -1 && isAttacked(state.board, king, other(state.turn))
}

export function legalMoves(state: ChessState): Move[] {
  const color = state.turn
  return pseudoMoves(state, color).filter((move) => {
    const next = applyMoveRaw(state, move)
    const king = findKing(next.board, color)
    return king !== -1 && !isAttacked(next.board, king, other(color))
  })
}

// FIDE dead positions: K vs K, K+minor vs K, and K+B vs K+B on one bishop colour.
// Anything else (K+N vs K+N, K+B vs K+N, two knights) still allows a help-mate,
// so it is not a draw until threefold or the fifty-move rule applies.
function insufficientMaterial(board: Board) {
  const pieces = board.reduce<Piece[]>((list, piece) => (piece ? [...list, piece] : list), [])
  const minors = pieces.filter((piece) => piece.type !== 'k')

  if (!minors.length) return true
  if (minors.length === 1) return minors[0].type === 'b' || minors[0].type === 'n'

  if (minors.length === 2 && minors.every((piece) => piece.type === 'b') && minors[0].color !== minors[1].color) {
    const squares = board.reduce<number[]>((list, piece, sq) => (piece && piece.type === 'b' ? [...list, sq] : list), [])
    if (squares.length === 2) {
      const light = (sq: number) => (rankOf(sq) + fileOf(sq)) % 2 === 0
      return light(squares[0]) === light(squares[1])
    }
  }

  return false
}

/**
 * The en passant square only counts towards repetition when the capture is
 * actually legal, which is what FIDE compares when it says "same position".
 */
function epCaptureAvailable(state: ChessState) {
  if (state.ep === null) return false
  const ep = state.ep
  const fromRank = rankOf(ep) + (state.turn === 'w' ? 1 : -1)

  for (const dc of [-1, 1]) {
    const from = squareAt(fromRank, fileOf(ep) + dc)
    if (from === -1) continue
    const piece = state.board[from]
    if (!piece || piece.color !== state.turn || piece.type !== 'p') continue
    const next = applyMoveRaw(state, { from, to: ep, piece: 'p', capture: 'p', enPassant: true })
    const king = findKing(next.board, state.turn)
    if (king !== -1 && !isAttacked(next.board, king, other(state.turn))) return true
  }

  return false
}

export function positionKey(state: ChessState) {
  let key = ''
  for (let sq = 0; sq < 64; sq += 1) {
    const piece = state.board[sq]
    key += piece ? (piece.color === 'w' ? piece.type.toUpperCase() : piece.type) : '.'
  }
  const { castling } = state
  const rights = `${castling.wK ? 'K' : ''}${castling.wQ ? 'Q' : ''}${castling.bK ? 'k' : ''}${castling.bQ ? 'q' : ''}`
  return `${key}|${state.turn}|${rights}${epCaptureAvailable(state) ? `|${state.ep}` : ''}`
}

/** Applies a move and records the resulting position for repetition detection. */
export function applyMove(state: ChessState, move: Move): ChessState {
  const next = applyMoveRaw(state, move)
  if (next === state || !state.history) return next
  return { ...next, history: [...state.history, positionKey(next)] }
}

function repetitions(state: ChessState) {
  const history = state.history
  if (!history || !history.length) return 1
  const current = history[history.length - 1]
  let count = 0
  for (const entry of history) if (entry === current) count += 1
  return count
}

export function drawReason(state: ChessState): DrawReason | null {
  if (state.halfmove >= 100) return 'fifty-move'
  if (repetitions(state) >= 3) return 'threefold'
  if (insufficientMaterial(state.board)) return 'insufficient-material'
  return null
}

export function statusOf(state: ChessState, moves: Move[]): ChessStatus {
  // Mate takes precedence even when the fifty-move counter also ran out.
  if (!moves.length) return inCheck(state) ? 'checkmate' : 'stalemate'
  if (drawReason(state)) return 'draw'
  if (inCheck(state)) return 'check'
  return 'playing'
}
