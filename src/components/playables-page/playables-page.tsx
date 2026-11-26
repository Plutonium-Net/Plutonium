import { useMemo, useState, type ReactNode } from 'react'
import BorderBeam from '@/components/border-beam/border-beam'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import { BEAM_PROPS } from '@/lib/beam'
import { play, useMuted } from '@/lib/playables/sound'
import BattleshipGame from './games/battleship'
import CheckersGame from './games/checkers'
import ChessGame from './games/chess'
import Connect4Game from './games/connect4'
import MinesweeperGame from './games/minesweeper'
import WordleGame from './games/wordle'
import './games/games.css'
import './playables-page.css'

export type Playable = {
  id: string
  name: string
  description: string
  category: string
  players: string
  icon: ReactNode
}

const PLAYABLES: Playable[] = [
  {
    id: 'chess',
    name: 'Chess',
    description: 'The full game: castling, en passant, promotion and checkmate.',
    category: 'Board',
    players: '2 players',
    icon: (
      <>
        <path d="M7 20h10" />
        <path d="M8 16h8l1-7-3.5 2.5L12 6l-1.5 5.5L7 9z" />
      </>
    ),
  },
  {
    id: 'connect4',
    name: 'Connect 4',
    description: 'Drop discs and line up four before the other colour does.',
    category: 'Classic',
    players: '2 players',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="9" cy="10" r="1.7" />
        <circle cx="15" cy="10" r="1.7" />
        <circle cx="9" cy="15" r="1.7" />
        <circle cx="15" cy="15" r="1.7" />
      </>
    ),
  },
  {
    id: 'battleship',
    name: 'Battleship',
    description: 'Hide your fleet, then call shots until one navy is gone.',
    category: 'Classic',
    players: '2 players',
    icon: (
      <>
        <path d="M3 15h18l-3 4H6z" />
        <path d="M7 15V9h4v6" />
        <path d="M14 15V6h3v9" />
      </>
    ),
  },
  {
    id: 'checkers',
    name: 'Checkers',
    description: 'Forced captures, chain jumps and kings on the far rank.',
    category: 'Board',
    players: '2 players',
    icon: (
      <>
        <circle cx="9" cy="9" r="4" />
        <circle cx="15" cy="15" r="4" />
      </>
    ),
  },
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    description: 'Ten mines, flood reveals and flags. The first click is safe.',
    category: 'Puzzle',
    players: 'Solo',
    icon: (
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
      </>
    ),
  },
  {
    id: 'wordle',
    name: 'Wordle',
    description: 'Six tries at a five-letter word, with colour-coded clues.',
    category: 'Word',
    players: 'Solo',
    icon: (
      <>
        <rect x="3" y="4" width="7" height="7" rx="1.6" />
        <rect x="14" y="4" width="7" height="7" rx="1.6" />
        <rect x="3" y="14" width="7" height="7" rx="1.6" />
      </>
    ),
  },
]

const GAMES: Record<string, () => ReactNode> = {
  chess: () => <ChessGame />,
  connect4: () => <Connect4Game />,
  battleship: () => <BattleshipGame />,
  checkers: () => <CheckersGame />,
  minesweeper: () => <MinesweeperGame />,
  wordle: () => <WordleGame />,
}

export default function PlayablesPage({ query = '' }: { query?: string }) {
  const [search, setSearch] = useState(query)
  const [focused, setFocused] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [muted, toggleMuted] = useMuted()

  const trimmed = search.trim()
  const results = useMemo(() => {
    const needle = trimmed.toLowerCase()
    if (!needle) return PLAYABLES
    return PLAYABLES.filter((playable) =>
      `${playable.name} ${playable.description} ${playable.category}`.toLowerCase().includes(needle),
    )
  }, [trimmed])

  const active = PLAYABLES.find((playable) => playable.id === activeId) ?? null

  if (active) {
    return (
      <div className="playables-page">
        <div className="playables-page__bar">
          <button type="button" className="playables-page__back" onClick={() => setActiveId(null)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
            All playables
          </button>
          <span className="playables-page__now">{active.name}</span>
          <button
            type="button"
            className={`playables-page__sound${muted ? ' is-off' : ''}`}
            aria-label={muted ? 'Turn sound effects on' : 'Turn sound effects off'}
            aria-pressed={!muted}
            title={muted ? 'Sound off' : 'Sound on'}
            onClick={() => {
              toggleMuted()
              if (muted) play('select')
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" />
              {muted ? <path d="M15 9l5 6M20 9l-5 6" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
            </svg>
          </button>
          <span className="playables-page__players">{active.players}</span>
        </div>
        <div className="playables-page__stage">{GAMES[active.id]()}</div>
      </div>
    )
  }

  return (
    <div className="playables-page">
      <div className="playables-page__scroll">
        <header className="playables-page__head">
          <h1 className="playables-page__title">Playables</h1>
          <p className="playables-page__lede">Small, instant things to play.</p>

          <div className={`playables-page__search${focused ? ' is-focused' : ''}`}>
            <BorderBeam className="playables-page__search-beam" {...BEAM_PROPS} borderRadius={999} active={focused}>
              <GlassSurface
                className="playables-page__search-glass"
                width="100%"
                height="100%"
                borderRadius={999}
                backgroundOpacity={0.1}
                saturation={1.2}
                displace={0.5}
              >
                <form className="playables-page__search-inner" onSubmit={(event) => event.preventDefault()}>
                  <svg className="playables-page__search-icon" viewBox="0 0 20 20" aria-hidden="true">
                    <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <line
                      x1="13.4"
                      y1="13.4"
                      x2="17.5"
                      y2="17.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  <input
                    className="playables-page__search-input"
                    type="text"
                    aria-label="Search playables"
                    placeholder="Search playables."
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                  />
                </form>
              </GlassSurface>
            </BorderBeam>
          </div>

          <p className="playables-page__meta">
            {trimmed ? `${results.length} of ${PLAYABLES.length}` : `${PLAYABLES.length} playables`}
          </p>
        </header>

        {results.length ? (
          <div className="playables-page__grid">
            {results.map((playable) => (
              <button
                key={playable.id}
                type="button"
                className="playables-page__card"
                onClick={() => setActiveId(playable.id)}
              >
                <GlassSurface
                  className="playables-page__card-glass"
                  width="100%"
                  height="100%"
                  borderRadius={14}
                  backgroundOpacity={0.1}
                  saturation={1.2}
                  displace={0.5}
                />
                <span className="playables-page__card-body">
                  <span className="playables-page__card-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">{playable.icon}</svg>
                  </span>
                  <span className="playables-page__card-name">{playable.name}</span>
                  <span className="playables-page__card-desc">{playable.description}</span>
                  <span className="playables-page__card-meta">
                    {playable.category} · {playable.players}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="playables-page__note">No playables match “{trimmed}”.</p>
        )}
      </div>
    </div>
  )
}
