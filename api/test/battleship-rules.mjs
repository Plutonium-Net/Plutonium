// Rules check for the shared Battleship engine. Runs the TypeScript module
// directly (Node strips the types):
//
//   node test/battleship-rules.mjs

import {
  CELLS,
  SHIPS,
  applyMove,
  canAct,
  canFire,
  cellsFor,
  colorOfSeat,
  fire,
  initialGame,
  nextShip,
  otherSeat,
  placeShip,
  randomFleet,
  readyUp,
  setFleet,
  shipsAfloat,
  statusOf,
  sunkShips,
  validateFleet,
  view,
} from '../../src/lib/playables/battleship.ts'

let failures = 0

function check(ok, label, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`)
  if (!ok) failures += 1
}

/** Place a seat's five ships on known rows, all horizontal. */
function placeAll(state, seat, starts) {
  let next = state
  for (const start of starts) {
    const placed = placeShip(next, seat, start, true)
    if (!placed) throw new Error(`could not place ship at ${start} for seat ${seat}`)
    next = placed
  }
  return next
}

/** Both fleets laid out on separate rows, ready to fight. */
function battle() {
  let state = initialGame()
  state = placeAll(state, 0, [0, 10, 20, 30, 40])
  state = readyUp(state, 0)
  state = placeAll(state, 1, [5, 15, 25, 35, 45])
  state = readyUp(state, 1)
  return state
}

// --- opening ----------------------------------------------------------------

const start = initialGame()
check(start.phase === 'place', 'starts in the placement phase', start.phase)
check(start.turn === 'a', 'seat a moves first', start.turn)
check(start.fleets.every((fleet) => fleet.length === 0), 'both fleets start empty')
check(SHIPS.length === 5, 'five ships per fleet', SHIPS.length)
check(canAct(start, 'a') && canAct(start, 'b'), 'both seats may place at once')

// --- ship geometry ----------------------------------------------------------

check(JSON.stringify(cellsFor(0, 5, true)) === '[0,1,2,3,4]', 'horizontal cells count off along the row', cellsFor(0, 5, true))
check(JSON.stringify(cellsFor(0, 5, false)) === '[0,10,20,30,40]', 'vertical cells step down the column', cellsFor(0, 5, false))
check(cellsFor(8, 3, true) === null, 'a ship cannot hang off the right edge', cellsFor(8, 3, true))
check(cellsFor(90, 3, false) === null, 'a ship cannot hang off the bottom edge', cellsFor(90, 3, false))
check(cellsFor(-1, 2, true) === null && cellsFor(CELLS, 2, true) === null, 'off-board starts are rejected')

check(nextShip(start, 0)?.name === 'Carrier', 'the carrier is placed first', nextShip(start, 0))

// --- placement --------------------------------------------------------------

{
  const one = placeShip(start, 0, 0, true)
  check(one?.fleets[0].length === 1, 'a click places one ship', one?.fleets[0].length)
  check(nextShip(one, 0)?.name === 'Battleship', 'the next ship follows the list', nextShip(one, 0)?.name)

  check(placeShip(one, 0, 3, true) === null, 'overlapping ships are rejected', placeShip(one, 0, 3, true))
  check(placeShip(one, 0, 9, true) === null, 'a ship off the edge is rejected')
  check(one?.fleets[1].length === 0, 'placing for seat a leaves seat b alone', one?.fleets[1].length)

  const cleared = one && applyMove(one, { kind: 'clear', seat: 0 })
  check(cleared?.fleets[0].length === 0, 'clearing empties the fleet', cleared?.fleets[0].length)
}

// --- whole-fleet placement (random layout) ---------------------------------

{
  const fleet = randomFleet()
  check(fleet.length === SHIPS.length, 'a random fleet has five ships', fleet.length)
  check(fleet.reduce((total, ship) => total + ship.cells.length, 0) === 17, 'a random fleet covers 17 cells')

  const placed = setFleet(start, 0, fleet)
  check(placed?.fleets[0].length === SHIPS.length, 'random placement fills the fleet', placed?.fleets[0].length)

  check(validateFleet(fleet) !== null, 'a random fleet validates')
  check(validateFleet([]) === null, 'an empty fleet is rejected')
  check(validateFleet(fleet.slice(0, 4)) === null, 'a short fleet is rejected')
  check(validateFleet([...fleet.slice(0, 4), { cells: fleet[4].cells.slice(0, 1) }]) === null, 'a wrong-length ship is rejected')
  check(
    validateFleet([{ cells: [0, 1, 2, 3, 4] }, { cells: [4, 5, 6, 7] }, fleet[2], fleet[3], fleet[4]]) === null,
    'overlapping ships in a fleet are rejected',
  )
  check(
    validateFleet([{ cells: [0, 11, 22, 33, 44] }, fleet[1], fleet[2], fleet[3], fleet[4]]) === null,
    'diagonal ships are rejected',
  )
}

// --- readiness --------------------------------------------------------------

{
  const partial = placeAll(start, 0, [0, 10, 20])
  check(readyUp(partial, 0) === null, 'a partial fleet cannot be readied', readyUp(partial, 0))

  let state = placeAll(start, 0, [0, 10, 20, 30, 40])
  state = readyUp(state, 0)
  check(state.phase === 'place', 'one ready fleet waits for the other', state.phase)
  check(!canAct(state, 'a') && canAct(state, 'b'), 'a ready seat stops placing while the other keeps going')

  state = placeAll(state, 1, [5, 15, 25, 35, 45])
  state = readyUp(state, 1)
  check(state.phase === 'battle', 'both ready fleets start the battle', state.phase)
  check(state.turn === 'a', 'seat a fires first', state.turn)
}

// --- shooting ---------------------------------------------------------------

{
  const state = battle()
  check(canFire(state, 0, 5), 'seat a may fire on its turn', true)
  check(!canFire(state, 1, 0), 'seat b may not fire out of turn')

  const hit = fire(state, 0, 5)
  check(hit?.shots[0].length === 1 && hit.shots[0][0].hit === true, 'hitting a ship records a hit', hit?.shots[0])
  check(hit?.turn === 'b', 'the turn passes after a shot', hit?.turn)
  check(fire(state, 1, 5) === null, 'firing out of turn is rejected')

  const miss = fire(hit, 1, 99)
  check(miss?.shots[1][0].hit === false, 'an empty square is a miss', miss?.shots[1][0])
  check(miss?.turn === 'a', 'the turn comes back', miss?.turn)
  check(fire(miss, 0, 5) === null, 'a square cannot be fired at twice')
}

// --- sinking a fleet --------------------------------------------------------

{
  let state = battle()
  const targets = [5, 6, 7, 8, 9, 15, 16, 17, 18, 25, 26, 27, 35, 36, 37, 45, 46]
  const misses = [90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 60, 61, 62, 63, 64, 65, 66]

  for (let move = 0; move < targets.length; move += 1) {
    state = fire(state, 0, targets[move])
    check(state !== null, `seat a hits ${targets[move]}`, null)
    if (move < targets.length - 1) state = fire(state, 1, misses[move])
  }

  check(state.shots[0].every((shot) => shot.hit), 'every fleet cell was hit', state.shots[0].filter((shot) => !shot.hit))
  check(sunkShips(state.fleets[1], state.shots[0]).length === SHIPS.length, 'the whole fleet is sunk', sunkShips(state.fleets[1], state.shots[0]).length)
  check(shipsAfloat(state.fleets[1], state.shots[0]) === 0, 'nothing is afloat', shipsAfloat(state.fleets[1], state.shots[0]))
  check(state.phase === 'won', 'the win ends the battle', state.phase)
  check(state.winner === 0, 'seat a wins', state.winner)
  check(statusOf(state) === 'won', 'status reports the win', statusOf(state))
  check(!canAct(state, 'a') && !canAct(state, 'b'), 'nobody moves after the win')
  check(fire(state, 0, 0) === null && fire(state, 1, 0) === null, 'shots after the win are rejected')
}

// --- hidden fleets ----------------------------------------------------------

{
  const state = battle()
  const forA = view(state, 'a')
  check(forA.fleets[0].length === SHIPS.length, 'seat a sees its own fleet', forA.fleets[0].length)
  check(forA.fleets[1].length === 0, 'seat a does not see the enemy fleet', forA.fleets[1].length)

  const forB = view(state, 'b')
  check(forB.fleets[1].length === SHIPS.length && forB.fleets[0].length === 0, 'the view is mirrored for seat b')

  const spectator = view(state, null)
  check(spectator.fleets.every((fleet) => fleet.length === 0), 'spectators see no fleet', spectator.fleets)
  check(state.fleets[0].length === SHIPS.length, 'the real state is untouched', state.fleets[0].length)
}

// --- seat helpers -----------------------------------------------------------

{
  check(colorOfSeat(0) === 'a' && colorOfSeat(1) === 'b', 'seats map to colours')
  check(otherSeat(0) === 1 && otherSeat(1) === 0, 'seats alternate')
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
process.exit(failures === 0 ? 0 : 1)
