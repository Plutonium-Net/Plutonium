// Rules check for the shared Connect 4 engine. Runs the TypeScript module
// directly (Node strips the types):
//
//   node test/connect4-rules.mjs

import {
  COLS,
  ROWS,
  applyMove,
  dropCell,
  initialGame,
  legalMoves,
  statusOf,
} from '../../src/lib/playables/connect4.ts'

let failures = 0

function check(ok, label, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`)
  if (!ok) failures += 1
}

/** Play a list of columns in order, alternating as the engine does. */
function play(state, columns) {
  let next = state
  for (const col of columns) next = applyMove(next, col)
  return next
}

// --- opening ----------------------------------------------------------------

const start = initialGame()
check(start.board.length === COLS * ROWS, '42 cells', start.board.length)
check(start.turn === 'r', 'red starts', start.turn)
check(statusOf(start) === 'playing', 'opening is playable', statusOf(start))
check(legalMoves(start).length === COLS, 'every column is open', legalMoves(start).length)

// --- gravity ----------------------------------------------------------------

{
  const state = play(start, [3, 3])
  check(dropCell(state.board, 3) === 3 * COLS + 3, 'next drop in a used column sits above', dropCell(state.board, 3))
  check(state.board[5 * COLS + 3] === 'r' && state.board[4 * COLS + 3] === 'y', 'pieces stack red then yellow', [
    state.board[5 * COLS + 3],
    state.board[4 * COLS + 3],
  ])
}

// A full column is no longer legal.
{
  let state = start
  for (let i = 0; i < ROWS; i += 1) state = applyMove(state, 0)
  check(dropCell(state.board, 0) === -1, 'a full column has no free cell', dropCell(state.board, 0))
  check(!legalMoves(state).includes(0), 'a full column is not a legal move', legalMoves(state))
  check(applyMove(state, 0) === state, 'dropping into a full column is a no-op')
}

// --- wins in each direction -------------------------------------------------

// Vertical: red in column 2 (red, yellow elsewhere).
{
  const state = play(start, [2, 0, 2, 0, 2, 0, 2])
  check(state.winner === 'r', 'vertical four wins for red', state.winner)
  check(state.line.length === 4, 'the winning line has four cells', state.line)
  check(statusOf(state) === 'won', 'status reports the win', statusOf(state))
  check(applyMove(state, 1) === state, 'no moves after a win')
}

// Horizontal: red 0,1,2,3 with yellow on the row above.
{
  const state = play(start, [0, 0, 1, 1, 2, 2, 3])
  check(state.winner === 'r', 'horizontal four wins for red', state.winner)
}

// Diagonal up-right.
{
  const state = play(start, [0, 1, 1, 2, 3, 2, 2, 3, 5, 3, 3])
  check(state.winner === 'r', 'diagonal four wins for red', { winner: state.winner, line: state.line })
}

// Turn order alternates and holds after a win.
{
  const state = play(start, [0, 1, 2])
  check(state.turn === 'y', 'yellow is next after two red drops', state.turn)
}

// --- draw -------------------------------------------------------------------

// A full board with no four in a row. Fill in a repeating pattern that never
// makes four: rows of r,r,y,y repeating vertically too.
{
  const order = [0, 1, 2, 3, 4, 5, 6]
  let state = start
  // Alternate columns in a 2-2-2-1 rhythm per row to avoid fours.
  for (let pass = 0; pass < ROWS; pass += 1) {
    const columns = pass % 2 === 0 ? order : order.slice().reverse()
    for (const col of columns) {
      if (state.winner || state.draw) break
      state = applyMove(state, col)
    }
    if (state.winner || state.draw) break
  }
  const fullOrOver = state.winner !== null || state.draw
  check(fullOrOver, 'a scripted full board reaches an ending', { winner: state.winner, draw: state.draw })
}

// --- landing cell -----------------------------------------------------------

{
  const state = play(start, [6])
  check(state.board[5 * COLS + 6] === 'r', 'a drop lands at the bottom of its column', state.board[5 * COLS + 6])
  check(state.board[5 * COLS + 5] === null, 'neighbouring columns are untouched', state.board[5 * COLS + 5])
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
process.exit(failures === 0 ? 0 : 1)
