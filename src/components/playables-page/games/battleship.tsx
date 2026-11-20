import { useState } from 'react'
import { play } from '@/lib/playables/sound'

const SIZE = 10

const SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
]

type Ship = { name: string; cells: number[] }
type Fleet = Ship[]
type Shot = { cell: number; hit: boolean }

function cellsFor(start: number, size: number, horizontal: boolean) {
  const row = Math.floor(start / SIZE)
  const col = start % SIZE
  const cells: number[] = []
  for (let i = 0; i < size; i += 1) {
    const r = row + (horizontal ? 0 : i)
    const c = col + (horizontal ? i : 0)
    if (r >= SIZE || c >= SIZE) return null
    cells.push(r * SIZE + c)
  }
  return cells
}

function occupied(fleet: Fleet) {
  return new Set(fleet.flatMap((ship) => ship.cells))
}

function sunkShips(fleet: Fleet, shots: Shot[]) {
  return fleet.filter((ship) => ship.cells.every((cell) => shots.some((shot) => shot.cell === cell)))
}

function randomFleet(): Fleet {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const fleet: Fleet = []
    const taken = new Set<number>()
    let ok = true
    for (const spec of SHIPS) {
      let placed = false
      for (let spin = 0; spin < 200 && !placed; spin += 1) {
        const cells = cellsFor(Math.floor(Math.random() * SIZE * SIZE), spec.size, Math.random() < 0.5)
        if (!cells || cells.some((cell) => taken.has(cell))) continue
        cells.forEach((cell) => taken.add(cell))
        fleet.push({ name: spec.name, cells })
        placed = true
      }
      if (!placed) {
        ok = false
        break
      }
    }
    if (ok) return fleet
  }
  return []
}

export default function BattleshipGame() {
  const [phase, setPhase] = useState<'place' | 'battle' | 'done'>('place')
  const [active, setActive] = useState(0)
  const [fleets, setFleets] = useState<Fleet[]>([[], []])
  const [shots, setShots] = useState<Shot[][]>([[], []])
  const [horizontal, setHorizontal] = useState(true)
  const [message, setMessage] = useState('')
  const [awaitingPass, setAwaitingPass] = useState(false)
  const [winner, setWinner] = useState<number | null>(null)

  const enemy = active === 0 ? 1 : 0
  const fleet = fleets[active]
  const nextShip = SHIPS[fleet.length] ?? null
  const ownCells = occupied(fleet)

  function place(cell: number) {
    if (!nextShip) return
    const cells = cellsFor(cell, nextShip.size, horizontal)
    if (!cells || cells.some((target) => ownCells.has(target))) return
    setFleets(fleets.map((entry, index) => (index === active ? [...entry, { name: nextShip.name, cells }] : entry)))
    setMessage('')
    play('select')
  }

  function shuffle() {
    setFleets(fleets.map((entry, index) => (index === active ? randomFleet() : entry)))
    setMessage('')
  }

  function clearFleet() {
    setFleets(fleets.map((entry, index) => (index === active ? [] : entry)))
    setMessage('')
  }

  function ready() {
    if (active === 0) {
      setActive(1)
      setMessage('')
      return
    }
    setPhase('battle')
    setActive(0)
    setMessage('')
  }

  function fire(cell: number) {
    if (phase !== 'battle' || awaitingPass) return
    const enemyShots = shots[enemy]
    if (enemyShots.some((shot) => shot.cell === cell)) return
    const hitShip = fleets[enemy].find((ship) => ship.cells.includes(cell))
    const nextShots = shots.map((list, index) => (index === enemy ? [...list, { cell, hit: !!hitShip }] : list))
    setShots(nextShots)

    const enemyFleet = fleets[enemy]
    const destroyed = sunkShips(enemyFleet, nextShots[enemy])
    setMessage(hitShip && destroyed.includes(hitShip) ? `Hit — ${hitShip.name} sunk.` : hitShip ? 'Hit.' : 'Miss.')

    if (hitShip && destroyed.includes(hitShip)) play('sink')
    else play(hitShip ? 'hit' : 'miss')

    if (enemyFleet.every((ship) => destroyed.includes(ship))) {
      setWinner(active)
      setPhase('done')
      play('win')
      return
    }
    setAwaitingPass(true)
  }

  function passTurn() {
    setActive(enemy)
    setAwaitingPass(false)
    setMessage('')
  }

  function restart() {
    setPhase('place')
    setActive(0)
    setFleets([[], []])
    setShots([[], []])
    setHorizontal(true)
    setMessage('')
    setAwaitingPass(false)
    setWinner(null)
  }

  if (phase === 'done') {
    return (
      <div className="ply-game bs">
        <p className="ply-game__status is-done">Player {(winner ?? 0) + 1} wins — fleet destroyed</p>
        <div className="ply-game__actions">
          <button type="button" className="ply-btn" onClick={restart}>
            New game
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'place') {
    return (
      <div className="ply-game bs">
        <p className="ply-game__status">
          Player {active + 1} — place your fleet
          {nextShip ? ` · ${nextShip.name} (${nextShip.size})` : ' · ready'}
        </p>

        <div className="bs__board bs__board--place">
          {Array.from({ length: SIZE * SIZE }, (_, cell) => {
            const ship = ownCells.has(cell)
            return (
              <button
                key={cell}
                type="button"
                className={`bs__cell${ship ? ' is-ship' : ''}`}
                aria-label={`Row ${Math.floor(cell / SIZE) + 1}, column ${(cell % SIZE) + 1}`}
                onClick={() => place(cell)}
              />
            )
          })}
        </div>

        <p className="bs__note">
          {fleet.length}/{SHIPS.length} ships placed · {horizontal ? 'horizontal' : 'vertical'}
        </p>

        <div className="ply-game__actions">
          <button type="button" className="ply-btn" onClick={() => setHorizontal(!horizontal)}>
            Rotate
          </button>
          <button type="button" className="ply-btn" onClick={shuffle}>
            Random
          </button>
          <button type="button" className="ply-btn" onClick={clearFleet} disabled={!fleet.length}>
            Clear
          </button>
          <button type="button" className="ply-btn is-primary" onClick={ready} disabled={fleet.length < SHIPS.length}>
            {active === 0 ? 'Next player' : 'Start battle'}
          </button>
        </div>
      </div>
    )
  }

  const afloat = SHIPS.length - sunkShips(fleets[active], shots[active]).length
  const enemyAfloat = SHIPS.length - sunkShips(fleets[enemy], shots[enemy]).length
  const enemyShots = shots[enemy]

  return (
    <div className="ply-game bs">
      <p className="ply-game__status">
        Player {active + 1} — fire at Player {enemy + 1}
      </p>

      <div className="bs__board">
        {Array.from({ length: SIZE * SIZE }, (_, cell) => {
          const shot = enemyShots.find((entry) => entry.cell === cell)
          return (
            <button
              key={cell}
              type="button"
              className={`bs__cell${shot ? (shot.hit ? ' is-hit' : ' is-miss') : ''}`}
              aria-label={`Fire at row ${Math.floor(cell / SIZE) + 1}, column ${(cell % SIZE) + 1}`}
              onClick={() => fire(cell)}
              disabled={!!shot || awaitingPass}
            />
          )
        })}
      </div>

      <p className="bs__note">
        Your fleet: {afloat} afloat · Enemy fleet: {enemyAfloat} afloat
      </p>

      {message && <p className={`bs__result${message.startsWith('Hit') ? ' is-hit' : ''}`}>{message}</p>}

      {awaitingPass ? (
        <div className="ply-game__actions">
          <button type="button" className="ply-btn is-primary" onClick={passTurn}>
            Pass to Player {enemy + 1}
          </button>
        </div>
      ) : (
        <p className="bs__note">Pick a square on the enemy grid.</p>
      )}
    </div>
  )
}
