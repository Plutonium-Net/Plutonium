import { useEffect, useState } from 'react'

const SIZE = 9
const MINES = 10

type Cell = { mine: boolean; open: boolean; flag: boolean; near: number }
type Status = 'idle' | 'playing' | 'won' | 'lost'

function blank(): Cell[] {
  return Array.from({ length: SIZE * SIZE }, () => ({ mine: false, open: false, flag: false, near: 0 }))
}

function neighbours(sq: number) {
  const row = Math.floor(sq / SIZE)
  const col = sq % SIZE
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (!dr && !dc) continue
      const r = row + dr
      const c = col + dc
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) out.push(r * SIZE + c)
    }
  }
  return out
}

function seeded(safe: number): Cell[] {
  const board = blank()
  const blocked = new Set([safe, ...neighbours(safe)])
  let placed = 0
  while (placed < MINES) {
    const sq = Math.floor(Math.random() * SIZE * SIZE)
    if (blocked.has(sq) || board[sq].mine) continue
    board[sq].mine = true
    placed += 1
  }
  board.forEach((cell, sq) => {
    cell.near = neighbours(sq).filter((index) => board[index].mine).length
  })
  return board
}

function reveal(board: Cell[], start: number): Cell[] {
  const next = board.map((cell) => ({ ...cell }))
  const stack = [start]
  while (stack.length) {
    const sq = stack.pop()
    if (sq === undefined) break
    const cell = next[sq]
    if (cell.open || cell.flag || cell.mine) continue
    cell.open = true
    if (cell.near === 0) {
      neighbours(sq).forEach((index) => {
        if (!next[index].open) stack.push(index)
      })
    }
  }
  return next
}

export default function MinesweeperGame() {
  const [cells, setCells] = useState<Cell[]>(blank)
  const [status, setStatus] = useState<Status>('idle')
  const [seconds, setSeconds] = useState(0)
  const [flagMode, setFlagMode] = useState(false)

  useEffect(() => {
    if (status !== 'playing') return
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [status])

  const flags = cells.filter((cell) => cell.flag).length
  const cleared = cells.filter((cell) => cell.open && !cell.mine).length

  function open(sq: number) {
    if (status === 'won' || status === 'lost') return
    const cell = cells[sq]
    if (cell.open) return
    if (cell.flag) return

    const board = status === 'idle' ? seeded(sq) : cells
    if (board[sq].mine) {
      const next = board.map((entry) => ({ ...entry, open: entry.mine ? true : entry.open }))
      setCells(next)
      setStatus('lost')
      return
    }

    const next = reveal(board, sq)
    const remaining = next.filter((entry) => !entry.mine && !entry.open).length
    setCells(next)
    setStatus(remaining === 0 ? 'won' : 'playing')
    if (status === 'idle') setSeconds(0)
  }

  function flag(sq: number) {
    if (status === 'won' || status === 'lost') return
    const cell = cells[sq]
    if (cell.open) return
    const next = cells.map((entry, index) => (index === sq ? { ...entry, flag: !entry.flag } : entry))
    setCells(next)
  }

  function click(sq: number) {
    if (flagMode) flag(sq)
    else open(sq)
  }

  function restart() {
    setCells(blank())
    setStatus('idle')
    setSeconds(0)
  }

  const label =
    status === 'won'
      ? `Cleared in ${seconds}s`
      : status === 'lost'
        ? 'Boom — try again'
        : `${MINES - flags} mines left · ${seconds}s`

  return (
    <div className="ply-game mine">
      <p className={`ply-game__status${status === 'won' || status === 'lost' ? ' is-done' : ''}`}>{label}</p>

      <div className="mine__board" onContextMenu={(event) => event.preventDefault()}>
        {cells.map((cell, sq) => {
          const classes = [
            'mine__cell',
            cell.open ? 'is-open' : '',
            cell.open && cell.mine ? 'is-mine' : '',
            cell.flag ? 'is-flag' : '',
            cell.open && cell.near > 0 ? `near-${cell.near}` : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={sq}
              type="button"
              className={classes}
              aria-label={`Row ${Math.floor(sq / SIZE) + 1}, column ${(sq % SIZE) + 1}`}
              onClick={() => click(sq)}
              onContextMenu={(event) => {
                event.preventDefault()
                flag(sq)
              }}
            >
              {cell.open && cell.mine ? '✹' : cell.open && cell.near > 0 ? cell.near : cell.flag ? '⚑' : ''}
            </button>
          )
        })}
      </div>

      <div className="ply-game__actions">
        <button
          type="button"
          className={`ply-btn${flagMode ? ' is-primary' : ''}`}
          onClick={() => setFlagMode(!flagMode)}
        >
          {flagMode ? 'Flag mode' : 'Dig mode'}
        </button>
        <button type="button" className="ply-btn" onClick={restart}>
          New game
        </button>
      </div>

      <p className="mine__note">{cleared}/{SIZE * SIZE - MINES} cleared · right-click to flag</p>
    </div>
  )
}
