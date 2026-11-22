import { useEffect, useMemo, useRef, useState } from 'react'
import {
  COLS,
  ROWS,
  applyMove,
  dropCell,
  initialGame,
  legalMoves,
  statusOf,
  type Connect4Color,
  type Connect4State,
} from '@/lib/playables/connect4'
import { createRoom, joinRoom, type RoomLink, type RoomSnapshot } from '@/lib/playables/rooms'
import { useAccount } from '@/hooks/use-account'
import { play } from '@/lib/playables/sound'

export default function Connect4Game() {
  const { user } = useAccount()

  const [mode, setMode] = useState<'local' | 'online'>('local')
  const [game, setGame] = useState<Connect4State>(initialGame)
  const [last, setLast] = useState<{ col: number; cell: number; ply: number } | null>(null)

  const [room, setRoom] = useState<RoomSnapshot<Connect4State> | null>(null)
  const [seat, setSeat] = useState<number | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const link = useRef<RoomLink | null>(null)

  useEffect(() => () => link.current?.close(), [])
  useEffect(() => {
    if (mode === 'local' && link.current) leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const online = mode === 'online'
  const board = online && room ? room.state : game
  const status = online && room ? room.status : statusOf(board)
  const finished = status !== 'playing'
  const open = useMemo(() => legalMoves(board), [board])

  const myColor: Connect4Color | null = seat === 0 ? 'r' : seat === 1 ? 'y' : null
  const myTurn = !online || (myColor !== null && board.turn === myColor)

  const opponent = room ? room.seats.find((entry) => entry.seat !== seat) : undefined

  function leave() {
    const current = link.current
    link.current = null
    current?.close()
    setRoom(null)
    setSeat(null)
    setNotice(null)
  }

  function connect(code: string) {
    if (!user) {
      setNotice('Sign in to play online.')
      return
    }

    leave()
    setBusy(true)
    setNotice(null)

    link.current = joinRoom<Connect4State>(code, 'connect4', user.idToken, {
      onOpen: () => setBusy(false),
      onSeat: (assigned, snapshot) => {
        setBusy(false)
        setSeat(assigned)
        setRoom(snapshot)
        if (assigned === null) setNotice('This room is full. You are watching as a spectator.')
      },
      onSnapshot: (snapshot, echo) => {
        setRoom(snapshot)
        if (echo) {
          setLast({ col: echo.col ?? 0, cell: echo.cell ?? -1, ply: echo.ply })
          play('drop')
          if (snapshot.status === 'won') play('win')
          else if (snapshot.status === 'draw') play('draw')
        }
      },
      onError: (message) => {
        setBusy(false)
        setNotice(message)
      },
      onClosed: () => {
        if (!link.current) return
        link.current = null
        setBusy(false)
        setNotice('Disconnected from the room.')
      },
    })
  }

  async function host() {
    if (!user) {
      setNotice('Sign in to play online.')
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      connect(await createRoom(user.idToken, 'connect4'))
    } catch (error) {
      setBusy(false)
      setNotice(error instanceof Error ? error.message : 'Could not create a room')
    }
  }

  function join() {
    const code = joinCode.trim().toUpperCase()
    if (!/^[A-Z0-9]{5}$/.test(code)) {
      setNotice('Room codes are five characters.')
      return
    }
    connect(code)
  }

  function drop(col: number) {
    if (finished || !myTurn || !open.includes(col)) return

    if (online) {
      link.current?.move({ col })
      return
    }

    const cell = dropCell(board.board, col)
    const next = applyMove(board, col)
    setGame(next)
    setLast({ col, cell, ply: (last?.ply ?? 0) + 1 })

    play('drop')
    if (next.winner) play('win')
    else if (next.draw) play('draw')
  }

  function restart() {
    setGame(initialGame())
    setLast(null)
  }

  const side = board.turn === 'r' ? 'White' : 'Black'
  let label: string
  if (board.winner) {
    label = `${board.winner === 'r' ? 'White' : 'Black'} wins`
  } else if (board.draw) {
    label = 'Draw · the board is full'
  } else if (online && room) {
    if (myColor === null) label = `${side} to move · spectating`
    else if (board.turn === myColor) label = 'Your move'
    else label = `Waiting for ${side}`
  } else {
    label = `${side} to move`
  }

  return (
    <div className="ply-game c4">
      <div className="c4__modes" role="group" aria-label="Connect 4 mode">
        <button
          type="button"
          className={`c4__mode${online ? '' : ' is-active'}`}
          aria-pressed={!online}
          onClick={() => setMode('local')}
        >
          Hot-seat
        </button>
        <button
          type="button"
          className={`c4__mode${online ? ' is-active' : ''}`}
          aria-pressed={online}
          onClick={() => setMode('online')}
        >
          Online
        </button>
      </div>

      {online && !user ? (
        <p className="c4__note">Sign in to play online. Hot-seat works without an account.</p>
      ) : null}

      {online && user && !room ? (
        <div className="c4__join">
          <button type="button" className="ply-btn is-primary" onClick={host} disabled={busy}>
            {busy ? 'Opening…' : 'Create room'}
          </button>
          <form
            className="c4__join-row"
            onSubmit={(event) => {
              event.preventDefault()
              join()
            }}
          >
            <input
              className="c4__join-input"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="CODE"
              aria-label="Room code"
              maxLength={5}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <button type="submit" className="ply-btn" disabled={busy || joinCode.trim().length !== 5}>
              Join
            </button>
          </form>
        </div>
      ) : null}

      {online && room ? (
        <div className="c4__room">
          <span className="c4__code">{room.code}</span>
          <span>{myColor ? `You are ${myColor === 'r' ? 'White' : 'Black'}` : 'Spectating'}</span>
          <span>
            {opponent?.name ? `${opponent.name} · ${opponent.online ? 'online' : 'away'}` : 'Waiting for an opponent'}
          </span>
          <button type="button" className="ply-btn" onClick={leave}>
            Leave
          </button>
        </div>
      ) : null}

      <p className={`ply-game__status${finished ? ' is-done' : ''}`}>{label}</p>

      <div className="c4__board">
        <div className="c4__grid">
          {Array.from({ length: ROWS * COLS }, (_, cell) => {
            const inLine = board.line.includes(cell)
            return (
              <button
                key={cell}
                type="button"
                className={`c4__cell ${
                  (Math.floor(cell / COLS) + (cell % COLS)) % 2 === 0 ? 'is-light' : 'is-dark'
                }${inLine ? ' is-win' : ''}${last && last.cell === cell ? ' is-last' : ''}`}
                aria-label={`Column ${(cell % COLS) + 1}, row ${ROWS - Math.floor(cell / COLS)}`}
                style={{ gridRow: Math.floor(cell / COLS) + 1, gridColumn: (cell % COLS) + 1 }}
                onClick={() => drop(cell % COLS)}
              />
            )
          })}
          {Array.from({ length: ROWS * COLS }, (_, cell) => {
            const disc = board.board[cell]
            if (!disc) return null
            return (
              <span
                key={`disc-${cell}`}
                className={`c4__disc is-${disc}${last && last.cell === cell ? ' is-last' : ''}${
                  board.line.includes(cell) ? ' is-win' : ''
                }`}
                style={{ gridRow: Math.floor(cell / COLS) + 1, gridColumn: (cell % COLS) + 1 }}
                aria-hidden="true"
              />
            )
          })}
        </div>
      </div>

      {notice ? <p className="c4__note">{notice}</p> : null}

      {online ? null : (
        <div className="ply-game__actions">
          <button type="button" className="ply-btn" onClick={restart}>
            New game
          </button>
        </div>
      )}
    </div>
  )
}
