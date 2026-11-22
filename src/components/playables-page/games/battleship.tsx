import { useEffect, useRef, useState } from 'react'
import {
  CELLS,
  SHIPS,
  SIZE,
  clearFleet,
  fire as fireAt,
  initialGame,
  nextShip,
  otherSeat,
  placeShip,
  randomFleet,
  readyUp,
  setFleet,
  shipsAfloat,
  sunkShips,
  type BattleshipState,
  type Fleet,
  type Shot,
} from '@/lib/playables/battleship'
import { createRoom, joinRoom, type RoomLink, type RoomSnapshot } from '@/lib/playables/rooms'
import { useAccount } from '@/hooks/use-account'
import { play } from '@/lib/playables/sound'

function Board({
  fleet,
  shots,
  showFleet,
  label,
  onCell,
  disabled,
  own,
}: {
  fleet: Fleet
  shots: Shot[]
  showFleet: boolean
  label: string
  onCell?: (cell: number) => void
  disabled?: boolean
  own?: boolean
}) {
  const ships = new Set(fleet.flatMap((ship) => ship.cells))

  return (
    <div className="bs__panel">
      <p className="bs__label">{label}</p>
      <div className="bs__board">
        {Array.from({ length: CELLS }, (_, cell) => {
          const shot = shots.find((entry) => entry.cell === cell)
          const ship = showFleet && ships.has(cell)
          const classes = [
            'bs__cell',
            (Math.floor(cell / SIZE) + (cell % SIZE)) % 2 === 0 ? 'is-light' : 'is-dark',
            shot ? (shot.hit ? 'is-hit' : 'is-miss') : ship ? 'is-ship' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={cell}
              type="button"
              className={classes}
              aria-label={`${own ? 'Your' : 'Enemy'} row ${Math.floor(cell / SIZE) + 1}, column ${
                (cell % SIZE) + 1
              }${shot ? (shot.hit ? ', hit' : ', miss') : ''}`}
              onClick={onCell ? () => onCell(cell) : undefined}
              disabled={!onCell || disabled || Boolean(shot)}
            />
          )
        })}
      </div>
    </div>
  )
}

export default function BattleshipGame() {
  const { user } = useAccount()

  const [mode, setMode] = useState<'local' | 'online'>('local')
  const [game, setGame] = useState<BattleshipState>(initialGame)
  const [active, setActive] = useState(0)
  const [horizontal, setHorizontal] = useState(true)
  const [message, setMessage] = useState('')
  const [awaitingPass, setAwaitingPass] = useState(false)

  const [room, setRoom] = useState<RoomSnapshot<BattleshipState> | null>(null)
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
  const finished = board.phase === 'won'
  const viewer = online ? seat : active
  const myFleet = viewer === null ? [] : board.fleets[viewer]
  const theirFleet = viewer === null ? [] : board.fleets[otherSeat(viewer)]
  const myShots = viewer === null ? [] : board.shots[viewer]
  const incoming = viewer === null ? [] : board.shots[otherSeat(viewer)]
  const placing = board.phase === 'place'
  const canPlace = viewer !== null && placing && !board.ready[viewer]
  const spectating = online && seat === null
  const myTurn = board.phase === 'battle' && (online ? seat !== null && board.turn === (seat === 0 ? 'a' : 'b') : !awaitingPass)
  const opponent = room ? room.seats.find((entry) => entry.seat !== seat) : undefined

  function leave() {
    const current = link.current
    link.current = null
    current?.close()
    setRoom(null)
    setSeat(null)
    setNotice(null)
    setMessage('')
  }

  function connect(code: string) {
    if (!user) {
      setNotice('Sign in to play online.')
      return
    }

    leave()
    setBusy(true)
    setNotice(null)

    link.current = joinRoom<BattleshipState>(code, 'battleship', user.idToken, {
      onOpen: () => setBusy(false),
      onSeat: (assigned, snapshot) => {
        setBusy(false)
        setSeat(assigned)
        setRoom(snapshot)
        if (assigned === null) setNotice('This room is full. You are watching as a spectator.')
      },
      onSnapshot: (snapshot, echo) => {
        setRoom(snapshot)
        setMessage('')
        if (!echo) return
        if (echo.fired) {
          if (echo.hit) play(echo.sunk ? 'sink' : 'hit')
          else play('miss')
          if (snapshot.state.phase === 'won') play('win')
        } else {
          play('select')
        }
      },
      onError: (text) => {
        setBusy(false)
        setNotice(text)
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
      connect(await createRoom(user.idToken, 'battleship'))
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

  function place(cell: number) {
    if (viewer === null || !canPlace) return
    if (online) {
      link.current?.move({ start: cell, horizontal })
      return
    }
    const next = placeShip(game, viewer, cell, horizontal)
    if (!next) {
      play('error')
      return
    }
    setGame(next)
    setMessage('')
    play('select')
  }

  function shuffle() {
    if (viewer === null || !canPlace) return
    const fleet = randomFleet()
    if (online) {
      link.current?.move({ fleet })
      return
    }
    const next = setFleet(game, viewer, fleet)
    if (!next) return
    setGame(next)
    setMessage('')
    play('select')
  }

  function wipe() {
    if (viewer === null || !canPlace) return
    if (online) {
      link.current?.move({ clear: true })
      return
    }
    const next = clearFleet(game, viewer)
    if (!next) return
    setGame(next)
    setMessage('')
  }

  function ready(fleet: Fleet) {
    if (viewer === null) return
    if (fleet.length < SHIPS.length) return
    if (online) {
      link.current?.move({ ready: true })
      return
    }

    const next = readyUp(game, viewer)
    if (!next) return
    setGame(next)
    setMessage('')
    play('select')

    if (viewer === 0) {
      setActive(1)
    } else {
      setActive(0)
      setAwaitingPass(false)
    }
  }

  function fire(cell: number) {
    if (viewer === null || finished) return

    if (online) {
      if (!myTurn) return
      link.current?.move({ cell })
      return
    }

    if (awaitingPass || board.phase !== 'battle') return
    const next = fireAt(game, viewer, cell)
    if (!next) return

    const target = otherSeat(viewer)
    const hitShip = game.fleets[target].find((ship) => ship.cells.includes(cell))
    const destroyed = hitShip && sunkShips(game.fleets[target], next.shots[viewer]).includes(hitShip)

    setGame(next)
    setMessage(destroyed ? `Hit · ${hitShip.name} sunk.` : hitShip ? 'Hit.' : 'Miss.')

    if (destroyed) play('sink')
    else play(hitShip ? 'hit' : 'miss')

    if (next.phase === 'won') play('win')
    else setAwaitingPass(true)
  }

  function passTurn() {
    setActive(otherSeat(active))
    setAwaitingPass(false)
    setMessage('')
  }

  function restart() {
    setGame(initialGame())
    setActive(0)
    setHorizontal(true)
    setMessage('')
    setAwaitingPass(false)
  }

  const next = viewer === null ? null : nextShip(board, viewer)
  const afloat = shipsAfloat(board.fleets[0], board.shots[1])
  const enemyAfloat = shipsAfloat(board.fleets[1], board.shots[0])

  let label: string
  if (finished) {
    if (!online) label = `Player ${(board.winner ?? 0) + 1} wins · fleet destroyed`
    else if (seat === null) label = `Player ${(board.winner ?? 0) + 1} wins · fleet destroyed`
    else label = board.winner === seat ? 'You win · enemy fleet destroyed' : 'You lose · your fleet is gone'
  } else if (placing) {
    if (!online) {
      label = `Player ${active + 1} · place your fleet${next ? ` · ${next.name} (${next.size})` : ' · ready'}`
    } else if (seat === null) {
      label = 'Spectating · fleets are being placed'
    } else if (board.ready[seat]) {
      label = 'Fleet ready · waiting for the other player'
    } else {
      label = next ? `Place your ${next.name} (${next.size})` : 'Fleet placed · ready when you are'
    }
  } else if (!online) {
    label = `Player ${active + 1} · fire at Player ${otherSeat(active) + 1}`
  } else if (seat === null) {
    label = `${board.turn === 'a' ? 'Player 1' : 'Player 2'} to fire`
  } else if (myTurn) {
    label = 'Your move · fire at the enemy grid'
  } else {
    label = 'Waiting for the other player'
  }

  return (
    <div className="ply-game bs">
      <div className="bs__modes" role="group" aria-label="Battleship mode">
        <button
          type="button"
          className={`bs__mode${online ? '' : ' is-active'}`}
          aria-pressed={!online}
          onClick={() => setMode('local')}
        >
          Hot-seat
        </button>
        <button
          type="button"
          className={`bs__mode${online ? ' is-active' : ''}`}
          aria-pressed={online}
          onClick={() => setMode('online')}
        >
          Online
        </button>
      </div>

      {online && !user ? (
        <p className="bs__note">Sign in to play online. Hot-seat works without an account.</p>
      ) : null}

      {online && user && !room ? (
        <div className="bs__join">
          <button type="button" className="ply-btn is-primary" onClick={host} disabled={busy}>
            {busy ? 'Opening…' : 'Create room'}
          </button>
          <form
            className="bs__join-row"
            onSubmit={(event) => {
              event.preventDefault()
              join()
            }}
          >
            <input
              className="bs__join-input"
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
        <div className="bs__room">
          <span className="bs__code">{room.code}</span>
          <span>{seat === null ? 'Spectating' : `You are Player ${seat + 1}`}</span>
          <span>
            {opponent?.name ? `${opponent.name} · ${opponent.online ? 'online' : 'away'}` : 'Waiting for an opponent'}
          </span>
          <button type="button" className="ply-btn" onClick={leave}>
            Leave
          </button>
        </div>
      ) : null}

      <p className={`ply-game__status${finished ? ' is-done' : ''}`}>{label}</p>

      {placing ? (
        <>
          <Board
            fleet={myFleet}
            shots={[]}
            showFleet
            own
            label={
              spectating
                ? 'Fleets are hidden while they are placed'
                : online
                  ? 'Your fleet'
                  : `Player ${active + 1}'s fleet`
            }
            onCell={canPlace ? place : undefined}
            disabled={!canPlace}
          />

          <p className="bs__note">
            {viewer === null
              ? 'Waiting for both fleets.'
              : `${myFleet.length}/${SHIPS.length} ships placed · ${horizontal ? 'horizontal' : 'vertical'}`}
          </p>

          {canPlace ? (
            <div className="ply-game__actions">
              <button type="button" className="ply-btn" onClick={() => setHorizontal(!horizontal)}>
                Rotate
              </button>
              <button type="button" className="ply-btn" onClick={shuffle}>
                Random
              </button>
              <button type="button" className="ply-btn" onClick={wipe} disabled={!myFleet.length}>
                Clear
              </button>
              <button
                type="button"
                className="ply-btn is-primary"
                onClick={() => ready(myFleet)}
                disabled={myFleet.length < SHIPS.length}
              >
                {online ? 'Ready' : active === 0 ? 'Next player' : 'Start battle'}
              </button>
            </div>
          ) : null}

          {online && viewer !== null && !canPlace ? (
            <p className="bs__note">Waiting for the other player to finish placing.</p>
          ) : null}
        </>
      ) : null}

      {!placing ? (
        <>
          <div className="bs__boards">
            {spectating ? (
              <>
                <Board
                  fleet={board.fleets[0]}
                  shots={board.shots[1]}
                  showFleet={false}
                  label="Player 1's waters"
                  disabled
                />
                <Board
                  fleet={board.fleets[1]}
                  shots={board.shots[0]}
                  showFleet={false}
                  label="Player 2's waters"
                  disabled
                />
              </>
            ) : (
              <>
                <Board
                  fleet={myFleet}
                  shots={incoming}
                  showFleet
                  own
                  label="Your fleet"
                  disabled
                />
                <Board
                  fleet={theirFleet}
                  shots={myShots}
                  showFleet={false}
                  label="Enemy waters"
                  onCell={myTurn && !finished ? fire : undefined}
                  disabled={!myTurn || finished}
                />
              </>
            )}
          </div>

          {!finished && !spectating ? (
            <p className="bs__note">
              {online
                ? `Afloat · you: ${shipsAfloat(myFleet, incoming)} · opponent: ${shipsAfloat(theirFleet, myShots)}`
                : `Player ${active + 1} afloat: ${afloat} · Player ${otherSeat(active) + 1} afloat: ${enemyAfloat}`}
            </p>
          ) : null}

          {message ? <p className={`bs__result${message.startsWith('Hit') ? ' is-hit' : ''}`}>{message}</p> : null}

          {!online && awaitingPass ? (
            <div className="ply-game__actions">
              <button type="button" className="ply-btn is-primary" onClick={passTurn}>
                Pass to Player {otherSeat(active) + 1}
              </button>
            </div>
          ) : null}

          {online && myTurn && !finished ? (
            <p className="bs__note">Pick a square on the enemy grid.</p>
          ) : null}

          {finished ? (
            <div className="ply-game__actions">
              {online ? (
                <button type="button" className="ply-btn" onClick={leave}>
                  Leave room
                </button>
              ) : (
                <button type="button" className="ply-btn" onClick={restart}>
                  New game
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {notice ? <p className="bs__note">{notice}</p> : null}
    </div>
  )
}
