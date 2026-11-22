// Battleship rules, shared by the browser and the room Durable Object so the
// server can validate placements and shots instead of trusting the client.
//
// The board is row-major with row 0 at the top. Each seat owns a fleet, and
// shots[seat] are the shots that seat has fired at the other fleet.

export const SIZE = 10
export const CELLS = SIZE * SIZE

export type BattleshipColor = 'a' | 'b'
export const COLORS: BattleshipColor[] = ['a', 'b']

export type ShipSpec = { name: string; size: number }

export const SHIPS: ShipSpec[] = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
]

export type Ship = ShipSpec & { cells: number[] }
export type Fleet = Ship[]
export type Shot = { cell: number; hit: boolean }
export type BattleshipPhase = 'place' | 'battle' | 'won'

export type BattleshipState = {
  phase: BattleshipPhase
  fleets: [Fleet, Fleet]
  shots: [Shot[], Shot[]]
  ready: [boolean, boolean]
  turn: BattleshipColor
  winner: number | null
}

export type BattleshipMove =
  | { kind: 'place'; seat: number; start: number; horizontal: boolean }
  | { kind: 'fleet'; seat: number; fleet: Fleet }
  | { kind: 'clear'; seat: number }
  | { kind: 'ready'; seat: number }
  | { kind: 'fire'; seat: number; cell: number }

export const colorOfSeat = (seat: number): BattleshipColor => (seat === 1 ? 'b' : 'a')
export const seatOfColor = (color: BattleshipColor): number => (color === 'b' ? 1 : 0)
export const otherSeat = (seat: number): number => (seat === 0 ? 1 : 0)

export function initialGame(): BattleshipState {
  return {
    phase: 'place',
    fleets: [[], []],
    shots: [[], []],
    ready: [false, false],
    turn: 'a',
    winner: null,
  }
}

/** Cells a ship of `size` would cover from `start`, or null off the board. */
export function cellsFor(start: number, size: number, horizontal: boolean): number[] | null {
  if (!Number.isInteger(start) || start < 0 || start >= CELLS) return null
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

export function occupied(fleet: Fleet): Set<number> {
  return new Set(fleet.flatMap((ship) => ship.cells))
}

/** The next ship a seat still has to place, or null when the fleet is placed. */
export function nextShip(state: BattleshipState, seat: number): ShipSpec | null {
  return SHIPS[state.fleets[seat]?.length ?? SHIPS.length] ?? null
}

/** A ship must cover a straight, unbroken run of cells. */
function inLine(cells: number[]): boolean {
  if (cells.length < 2) return true
  const rows = new Set(cells.map((cell) => Math.floor(cell / SIZE)))
  const cols = new Set(cells.map((cell) => cell % SIZE))
  const sorted = [...cells].sort((a, b) => a - b)
  if (rows.size === 1) return sorted.every((cell, index) => index === 0 || cell === sorted[index - 1] + 1)
  if (cols.size === 1) return sorted.every((cell, index) => index === 0 || cell === sorted[index - 1] + SIZE)
  return false
}

/** Accepts an untrusted fleet (from the wire) and returns a clean copy. */
export function validateFleet(input: unknown): Fleet | null {
  if (!Array.isArray(input) || input.length !== SHIPS.length) return null

  const seen = new Set<number>()
  const fleet: Fleet = []

  for (let index = 0; index < SHIPS.length; index += 1) {
    const spec = SHIPS[index]
    const entry = input[index] as { cells?: unknown } | null
    const raw = entry && Array.isArray(entry.cells) ? entry.cells : null
    if (!raw || raw.length !== spec.size) return null

    const cells: number[] = []
    for (const value of raw) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= CELLS) return null
      if (seen.has(value)) return null
      seen.add(value)
      cells.push(value)
    }
    if (!inLine(cells)) return null
    fleet.push({ name: spec.name, size: spec.size, cells })
  }

  return fleet
}

/** Places the seat's next ship; null when the square is not free or turn is past setup. */
export function placeShip(
  state: BattleshipState,
  seat: number,
  start: number,
  horizontal: boolean,
): BattleshipState | null {
  if (state.phase !== 'place' || state.ready[seat]) return null
  const spec = nextShip(state, seat)
  if (!spec) return null

  const cells = cellsFor(start, spec.size, horizontal)
  if (!cells) return null
  const taken = occupied(state.fleets[seat])
  if (cells.some((cell) => taken.has(cell))) return null

  const fleets = state.fleets.map((fleet, index) =>
    index === seat ? [...fleet, { name: spec.name, size: spec.size, cells }] : fleet,
  ) as [Fleet, Fleet]

  return { ...state, fleets }
}

/** Replaces a seat's whole fleet (used by the random layout). */
export function setFleet(state: BattleshipState, seat: number, fleet: Fleet): BattleshipState | null {
  if (state.phase !== 'place' || state.ready[seat]) return null
  const clean = validateFleet(fleet)
  if (!clean) return null

  const fleets = state.fleets.map((entry, index) => (index === seat ? clean : entry)) as [Fleet, Fleet]
  return { ...state, fleets }
}

export function clearFleet(state: BattleshipState, seat: number): BattleshipState | null {
  if (state.phase !== 'place' || state.ready[seat]) return null
  const fleets = state.fleets.map((fleet, index) => (index === seat ? [] : fleet)) as [Fleet, Fleet]
  return { ...state, fleets }
}

/** Locks in the seat's fleet; once both are ready the battle begins on 'a'. */
export function readyUp(state: BattleshipState, seat: number): BattleshipState | null {
  if (state.phase !== 'place' || state.ready[seat]) return null
  if (state.fleets[seat].length !== SHIPS.length) return null

  const ready = state.ready.map((value, index) => (index === seat ? true : value)) as [boolean, boolean]
  const both = ready[0] && ready[1]

  return { ...state, ready, phase: both ? 'battle' : 'place', turn: both ? 'a' : state.turn }
}

export function sunkShips(fleet: Fleet, shots: Shot[]): Fleet {
  return fleet.filter((ship) => ship.cells.every((cell) => shots.some((shot) => shot.cell === cell)))
}

export function shipsAfloat(fleet: Fleet, shots: Shot[]): number {
  return fleet.length - sunkShips(fleet, shots).length
}

export function canFire(state: BattleshipState, seat: number, cell: number): boolean {
  if (state.phase !== 'battle') return false
  if (state.turn !== colorOfSeat(seat)) return false
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) return false
  return !state.shots[seat].some((shot) => shot.cell === cell)
}

/** Fires one shot and hands the turn over; null when the shot is not allowed. */
export function fire(state: BattleshipState, seat: number, cell: number): BattleshipState | null {
  if (!canFire(state, seat, cell)) return null

  const target = otherSeat(seat)
  const hit = state.fleets[target].some((ship) => ship.cells.includes(cell))
  const shots = state.shots.map((list, index) =>
    index === seat ? [...list, { cell, hit }] : list,
  ) as [Shot[], Shot[]]

  const destroyed = sunkShips(state.fleets[target], shots[seat])
  const won = state.fleets[target].length === SHIPS.length && destroyed.length === state.fleets[target].length

  return {
    ...state,
    shots,
    phase: won ? 'won' : 'battle',
    winner: won ? seat : null,
    turn: won ? state.turn : colorOfSeat(otherSeat(seat)),
  }
}

export function applyMove(state: BattleshipState, move: BattleshipMove): BattleshipState {
  if (move.kind === 'place') return placeShip(state, move.seat, move.start, move.horizontal) ?? state
  if (move.kind === 'fleet') return setFleet(state, move.seat, move.fleet) ?? state
  if (move.kind === 'clear') return clearFleet(state, move.seat) ?? state
  if (move.kind === 'ready') return readyUp(state, move.seat) ?? state
  return fire(state, move.seat, move.cell) ?? state
}

export function statusOf(state: BattleshipState): BattleshipPhase {
  return state.phase
}

/** Whether this colour may act right now: both place during setup, then turns. */
export function canAct(state: BattleshipState, color: BattleshipColor): boolean {
  const seat = seatOfColor(color)
  if (state.phase === 'place') return !state.ready[seat]
  if (state.phase === 'battle') return state.turn === color
  return false
}

/**
 * What a seat is allowed to see: its own fleet, and none of the other fleet's
 * ship cells. Spectators (null) see no fleet at all. Shots are public.
 */
export function view(state: BattleshipState, color: BattleshipColor | null): BattleshipState {
  const seat = color === null ? -1 : seatOfColor(color)
  return {
    ...state,
    fleets: [seat === 0 ? state.fleets[0] : [], seat === 1 ? state.fleets[1] : []],
  }
}

export function randomFleet(): Fleet {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const fleet: Fleet = []
    const taken = new Set<number>()
    let ok = true

    for (const spec of SHIPS) {
      let placed = false
      for (let spin = 0; spin < 200 && !placed; spin += 1) {
        const cells = cellsFor(
          Math.floor(Math.random() * CELLS),
          spec.size,
          Math.random() < 0.5,
        )
        if (!cells || cells.some((cell) => taken.has(cell))) continue
        cells.forEach((cell) => taken.add(cell))
        fleet.push({ name: spec.name, size: spec.size, cells })
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
