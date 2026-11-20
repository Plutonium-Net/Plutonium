// Rules check for the shared checkers engine. Runs the TypeScript module
// directly (Node strips the types):
//
//   node test/checkers-rules.mjs

import {
  applyMove,
  drawReason,
  initialBoard,
  initialGame,
  legalMoves,
  movesFor,
  positionKey,
  statusOf,
  winnerOf,
} from '../../src/lib/playables/checkers.ts'

let failures = 0

function check(ok, label, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`)
  if (!ok) failures += 1
}

const blank = () => Array(64).fill(null)
const man = (color) => ({ color, king: false })
const king = (color) => ({ color, king: true })

function game(board, turn = 'r', extra = {}) {
  const state = { board, turn, chain: null, winner: null, quiet: 0, history: [], ...extra }
  state.history = [positionKey(state)]
  return state
}

// --- opening position -------------------------------------------------------

const start = initialGame()
check(start.board.filter(Boolean).length === 24, '24 pieces on the opening board', start.board.filter(Boolean).length)
check(start.turn === 'r', 'red moves first', start.turn)

const opening = legalMoves(start)
check(opening.length === 7, 'seven opening moves', opening.length)
check(
  opening.every((move) => move.capture == null),
  'no captures available at the start',
  opening.filter((m) => m.capture != null)
)

// --- compulsory captures ----------------------------------------------------

// Red man on c3 can jump the black man on d4, and another red man is free to
// step; only the jump may be played.
{
  const board = blank()
  board[42] = man('r') // c3
  board[35] = man('b') // d4
  board[38] = man('r') // f3
  const moves = movesFor(board, 'r', null)
  check(moves.length === 1 && moves[0].capture === 35, 'a capture is compulsory', moves)
  check(moves[0].from === 42 && moves[0].to === 28, 'the jump lands behind the victim', moves[0])
}

// --- chain jumps ------------------------------------------------------------

{
  const board = blank()
  board[42] = man('r') // c3
  board[35] = man('b') // d4
  board[19] = man('b') // d6
  const state = game(board)
  const first = legalMoves(state).find((move) => move.capture === 35)
  const after = applyMove(state, first)
  check(after.chain === 28, 'the jumper must continue from e5', after.chain)
  check(after.turn === 'r', 'the same player keeps the turn mid-chain', after.turn)

  const second = legalMoves(after)
  check(second.length === 1 && second[0].from === 28 && second[0].capture === 19, 'only the chain jump is legal', second)

  const done = applyMove(after, second[0])
  check(done.chain === null, 'chain clears when no further jump exists', done.chain)
  check(done.turn === 'b', 'turn passes once the chain ends', done.turn)
  check(done.board[35] === null && done.board[19] === null, 'both victims are removed')
}

// --- crowning ---------------------------------------------------------------

{
  const board = blank()
  board[18] = man('r') // c6
  board[11] = man('b') // d7
  const state = game(board)
  const jump = legalMoves(state).find((move) => move.capture === 11)
  const after = applyMove(state, jump)
  check(after.board[4] !== null && after.board[4].king === true, 'a man crowning on the far rank becomes a king', after.board[4])
  check(after.chain === null, 'crowning ends the turn', after.chain)
  check(after.turn === 'b', 'turn passes after crowning', after.turn)
}

// A crowned man that could otherwise keep jumping still stops.
{
  const board = blank()
  board[18] = man('r') // c6
  board[11] = man('b') // d7  (jumped, lands on e8)
  board[13] = man('b') // f7  (would be reachable from e8 going back down)
  const state = game(board)
  const jump = legalMoves(state).find((move) => move.capture === 11)
  const after = applyMove(state, jump)
  check(after.chain === null, 'no chain after crowning even with a jump available elsewhere', after.chain)
}

// --- no legal move loses ----------------------------------------------------

{
  const board = blank()
  board[56] = man('r') // a1, only step is onto d... blocked
  board[49] = man('b') // b2 blocking the step
  board[42] = man('b') // c3 blocking the landing of a jump over b2
  const state = game(board, 'r')
  check(legalMoves(state).length === 0, 'stuck player has no moves', legalMoves(state))
  check(winnerOf(state) === 'b', 'the side with no move loses', winnerOf(state))
  check(statusOf(state) === 'won', 'status reports a win', statusOf(state))
}

// --- draw rules -------------------------------------------------------------

// Two kings shuffling: the starting position comes round a third time.
{
  const board = blank()
  board[56] = king('r') // a1
  board[7] = king('b') // h8
  let state = game(board, 'r')
  const script = [
    [56, 49], [7, 14],
    [49, 56], [14, 7],
    [56, 49], [7, 14],
    [49, 56], [14, 7],
  ]
  let plies = 0
  let drawn = null
  while (plies < script.length) {
    const [from, to] = script[plies]
    const move = legalMoves(state).find((candidate) => candidate.from === from && candidate.to === to)
    if (!move) break
    state = applyMove(state, move)
    plies += 1
    if (drawReason(state)) {
      drawn = drawReason(state)
      break
    }
  }
  check(drawn === 'threefold', 'third repetition is a draw', { drawn, plies })
  check(statusOf(state) === 'draw', 'status reports the draw', statusOf(state))
}

// Forty quiet plies by each side without a capture or crowning.
{
  const board = blank()
  board[56] = king('r')
  board[7] = king('b')
  const quietState = game(board, 'r', { quiet: 79 })
  check(drawReason(quietState) === null, 'seventy-nine quiet plies is still playable', drawReason(quietState))
  const over = game(board, 'r', { quiet: 80 })
  check(drawReason(over) === 'forty-move', 'eighty quiet plies is a draw', drawReason(over))
}

// The counter resets on a capture.
{
  const board = blank()
  board[42] = man('r')
  board[35] = man('b')
  const state = game(board, 'r', { quiet: 55 })
  const after = applyMove(state, legalMoves(state)[0])
  check(after.quiet === 0, 'a capture resets the quiet counter', after.quiet)
}

// --- opening board sanity ---------------------------------------------------

check(initialBoard().filter(Boolean).length === 24, 'initialBoard builds 24 pieces', 0)

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
process.exit(failures === 0 ? 0 : 1)
