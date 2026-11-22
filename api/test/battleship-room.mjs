// Checks the Battleship room adapter (the part api/game-room.js uses to
// validate moves and redact snapshots) without starting wrangler:
//
//   node test/battleship-room.mjs

import { GAMES } from '../game-room.js'
import { randomFleet, SHIPS } from '../../src/lib/playables/battleship.ts'

let failures = 0

function check(ok, label, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`)
  if (!ok) failures += 1
}

const game = GAMES.battleship
check(Boolean(game), 'battleship is registered as a room game')
check(JSON.stringify(game.colors) === '["a","b"]', 'the room seats are a and b', game.colors)

let state = game.initial()
check(state.phase === 'place', 'the room opens in placement', state.phase)

// --- placement over the wire ------------------------------------------------

const first = game.parse(state, [], { start: 0, horizontal: true }, 0)
check(first?.move?.kind === 'place', 'a start square parses as a placement', first)
check(first?.from === 0 && first?.to === 4, 'the parsed move names the ship run', first && [first.from, first.to])

state = game.apply(state, first.move)
check(state.fleets[0].length === 1, 'the placement lands in the fleet', state.fleets[0].length)

// A seat that is done placing cannot keep going.
{
  const full = game.parse(state, [], { fleet: randomFleet() }, 0)
  check(full?.move?.kind === 'fleet', 'a whole fleet parses as a fleet move', full?.move?.kind)

  const placed = game.apply(state, full.move)
  check(placed.fleets[0].length === SHIPS.length, 'the random fleet fills the fleet', placed.fleets[0].length)

  const afterReady = game.apply(placed, game.parse(placed, [], { ready: true }, 0).move)
  check(afterReady.ready[0] === true, 'ready locks the fleet', afterReady.ready)
  check(game.parse(afterReady, [], { start: 70, horizontal: true }, 0) === null, 'no more placement once ready')
  check(!game.canAct(afterReady, 'a'), 'a ready seat cannot act', true)
  check(game.canAct(afterReady, 'b'), 'the other seat can still place', true)
}

// --- readiness errors -------------------------------------------------------

{
  const early = game.parse(game.initial(), [], { ready: true }, 0)
  check(early?.error === 'fleet-incomplete', 'ready before placing is rejected', early)
}

// --- battle over the wire ---------------------------------------------------

{
  let ready = game.initial()
  for (const seat of [0, 1]) {
    ready = game.apply(ready, game.parse(ready, [], { fleet: randomFleet() }, seat).move)
    ready = game.apply(ready, game.parse(ready, [], { ready: true }, seat).move)
  }
  check(ready.phase === 'battle', 'both ready seats start the battle', ready.phase)
  check(game.status(ready, []) === 'battle', 'the room reports the battle', game.status(ready, []))

  // Find a square of b's fleet and an empty square, so the shot results are known.
  const target = ready.fleets[1][0].cells[0]
  const occupied = new Set(ready.fleets[1].flatMap((ship) => ship.cells))
  const empty = Array.from({ length: 100 }, (_, cell) => cell).find((cell) => !occupied.has(cell))

  const hitParse = game.parse(ready, [], { cell: target }, 0)
  check(hitParse?.move?.kind === 'fire', 'a cell parses as a shot', hitParse)
  const afterHit = game.apply(ready, hitParse.move)
  const hitEcho = game.echo({ state: afterHit, move: hitParse.move })
  check(hitEcho.fired === true && hitEcho.hit === true, 'a hit is echoed', hitEcho)

  const missParse = game.parse(afterHit, [], { cell: empty }, 1)
  const afterMiss = game.apply(afterHit, missParse.move)
  const missEcho = game.echo({ state: afterMiss, move: missParse.move })
  check(missEcho.hit === false, 'a miss is echoed', missEcho)

  check(game.parse(afterMiss, [], { cell: target }, 1) === null, 'out-of-turn shots are rejected')
  check(game.parse(afterMiss, [], { cell: target }, 0) === null, 'repeat shots are rejected')

  // Placement notices must not leak a square to the opponent.
  const placeEcho = game.echo({ state: ready, move: { kind: 'place', seat: 0, start: 0, horizontal: true } })
  check(placeEcho.from === -1 && placeEcho.to === -1, 'placement echoes carry no square', placeEcho)
  check(placeEcho.placed === true, 'placement echoes say what happened', placeEcho)

  // --- snapshots ------------------------------------------------------------

  check(game.view(ready, 'b').fleets[0].length === 0, 'seat b never receives seat a\'s fleet', game.view(ready, 'b').fleets[0].length)
  check(game.view(ready, 'b').fleets[1].length === SHIPS.length, 'seat b receives its own fleet', game.view(ready, 'b').fleets[1].length)
  check(game.view(ready, null).fleets.every((fleet) => fleet.length === 0), 'spectators receive no fleets')
  check(game.view(ready, 'a').shots[0].length === ready.shots[0].length, 'shots stay visible to both seats')
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
process.exit(failures === 0 ? 0 : 1)
