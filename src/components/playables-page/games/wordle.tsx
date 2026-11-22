import { useEffect, useMemo, useState } from 'react'
import { play } from '@/lib/playables/sound'

const ROWS = 6
const LENGTH = 5
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

const WORDS = [
  'about', 'above', 'actor', 'acute', 'admit', 'adopt', 'adult', 'after', 'again', 'agent',
  'agree', 'ahead', 'alarm', 'album', 'alert', 'alike', 'alive', 'allow', 'alone', 'along',
  'alter', 'among', 'anger', 'angle', 'angry', 'apart', 'apple', 'apply', 'arena', 'argue',
  'arise', 'array', 'aside', 'asset', 'audio', 'audit', 'avoid', 'awake', 'award', 'aware',
  'awful', 'baker', 'basic', 'beach', 'beard', 'beast', 'began', 'begin', 'being', 'below',
  'bench', 'berry', 'birth', 'black', 'blade', 'blame', 'blank', 'blast', 'blend', 'blind',
  'block', 'blood', 'board', 'boost', 'booth', 'bound', 'brain', 'brand', 'brave', 'bread',
  'break', 'breed', 'brick', 'bride', 'brief', 'bring', 'broad', 'broke', 'brown', 'brush',
  'build', 'built', 'bunch', 'burst', 'cabin', 'cable', 'camel', 'candy', 'canoe', 'cargo',
  'carry', 'carve', 'catch', 'cause', 'chain', 'chair', 'chalk', 'charm', 'chart', 'chase',
  'cheap', 'check', 'cheek', 'cheer', 'chess', 'chest', 'chief', 'child', 'chose', 'civil',
  'claim', 'class', 'clean', 'clear', 'clerk', 'click', 'cliff', 'climb', 'clock', 'close',
  'cloth', 'cloud', 'coach', 'coast', 'cocoa', 'color', 'comet', 'comic', 'coral', 'couch',
  'could', 'count', 'court', 'cover', 'crack', 'craft', 'crane', 'crash', 'crate', 'crazy',
  'cream', 'creek', 'crest', 'crime', 'crisp', 'cross', 'crowd', 'crown', 'crust', 'curve',
  'cycle', 'daily', 'dairy', 'dance', 'dealt', 'death', 'debut', 'decay', 'delay', 'delta',
  'dense', 'depth', 'derby', 'devil', 'diary', 'digit', 'dirty', 'ditch', 'diver', 'dizzy',
  'dodge', 'doing', 'donor', 'doubt', 'dough', 'dozen', 'draft', 'drain', 'drama', 'drank',
  'drawn', 'dream', 'dress', 'dried', 'drift', 'drill', 'drink', 'drive', 'drove', 'drown',
  'dying', 'eager', 'eagle', 'early', 'earth', 'eaten', 'eight', 'elbow', 'elder', 'elect',
  'elite', 'empty', 'enemy', 'enjoy', 'enter', 'entry', 'equal', 'error', 'essay', 'event',
  'every', 'exact', 'exist', 'extra', 'fable', 'faced', 'faint', 'fairy', 'faith', 'false',
  'fancy', 'fatal', 'fault', 'favor', 'feast', 'fence', 'ferry', 'fever', 'fiber', 'field',
  'fifth', 'fifty', 'fight', 'final', 'first', 'flame', 'flash', 'fleet', 'flesh', 'float',
  'flock', 'flood', 'floor', 'flour', 'fluid', 'flush', 'focus', 'force', 'forge', 'forth',
  'forty', 'forum', 'found', 'frame', 'fraud', 'fresh', 'fried', 'front', 'frost', 'fruit',
  'fully', 'funny', 'giant', 'given', 'glass', 'globe', 'glory', 'glove', 'going', 'grace',
  'grade', 'grain', 'grand', 'grant', 'grape', 'graph', 'grasp', 'grass', 'grave', 'great',
  'green', 'greet', 'grief', 'grill', 'grind', 'groan', 'gross', 'group', 'grove', 'grown',
  'guard', 'guess', 'guest', 'guide', 'happy', 'harsh', 'haste', 'hatch', 'haunt', 'haven',
  'heart', 'heavy', 'hedge', 'hello', 'hence', 'hobby', 'honey', 'honor', 'horse', 'hotel',
  'house', 'hover', 'human', 'humor', 'hurry', 'ideal', 'image', 'imply', 'index', 'inner',
  'input', 'irony', 'issue', 'ivory', 'jelly', 'joint', 'judge', 'juice', 'knife', 'knock',
  'known', 'label', 'labor', 'large', 'laser', 'later', 'laugh', 'layer', 'learn', 'lease',
  'least', 'leave', 'legal', 'lemon', 'level', 'lever', 'light', 'limit', 'linen', 'liver',
  'lobby', 'local', 'lodge', 'logic', 'loose', 'loser', 'lower', 'loyal', 'lucky', 'lunar',
  'lunch', 'lying', 'magic', 'major', 'maker', 'mango', 'maple', 'march', 'marsh', 'match',
  'mayor', 'meant', 'medal', 'media', 'melon', 'mercy', 'merge', 'merit', 'metal', 'meter',
  'midst', 'might', 'minor', 'minus', 'mixed', 'model', 'moist', 'money', 'month', 'moral',
  'motor', 'mount', 'mouse', 'mouth', 'movie', 'music', 'naked', 'nasty', 'naval', 'needy',
  'nerve', 'never', 'newly', 'night', 'noble', 'noise', 'north', 'novel', 'nurse', 'nylon',
  'ocean', 'offer', 'often', 'olive', 'onion', 'opera', 'orbit', 'order', 'organ', 'other',
  'ought', 'ounce', 'outer', 'owner', 'oxide', 'ozone', 'paint', 'panel', 'paper', 'party',
  'pasta', 'patch', 'pause', 'peace', 'peach', 'pearl', 'pedal', 'penny', 'perch', 'phase',
  'phone', 'photo', 'piano', 'piece', 'pilot', 'pitch', 'place', 'plain', 'plane', 'plant',
  'plate', 'plaza', 'plead', 'point', 'polar', 'pound', 'power', 'press', 'price', 'pride',
  'prime', 'print', 'prior', 'prize', 'probe', 'proof', 'proud', 'prove', 'pulse', 'punch',
  'pupil', 'purse', 'queen', 'query', 'quest', 'queue', 'quick', 'quiet', 'quilt', 'quite',
  'quota', 'quote', 'radar', 'radio', 'raise', 'rally', 'ranch', 'range', 'rapid', 'ratio',
  'reach', 'react', 'ready', 'realm', 'rebel', 'refer', 'reign', 'relax', 'relay', 'renew',
  'repay', 'reply', 'reset', 'resin', 'rhyme', 'rider', 'ridge', 'rifle', 'right', 'rigid',
  'rival', 'river', 'roast', 'robin', 'robot', 'rocky', 'rogue', 'rough', 'round', 'route',
  'royal', 'rugby', 'ruler', 'rural', 'saint', 'salad', 'salon', 'salsa', 'sauce', 'scale',
  'scare', 'scarf', 'scene', 'scent', 'scoop', 'scope', 'score', 'scout', 'scrap', 'screw',
  'scrub', 'seize', 'sense', 'serve', 'seven', 'shade', 'shaft', 'shake', 'shall', 'shame',
  'shape', 'share', 'shark', 'sharp', 'sheep', 'sheet', 'shelf', 'shell', 'shift', 'shine',
  'shirt', 'shock', 'shoot', 'shore', 'short', 'shown', 'sight', 'silly', 'since', 'siren',
  'sixth', 'sixty', 'skate', 'skill', 'skirt', 'slate', 'sleep', 'slice', 'slide', 'slope',
  'small', 'smart', 'smile', 'smoke', 'snake', 'solar', 'solid', 'solve', 'sorry', 'sound',
  'south', 'space', 'spare', 'spark', 'speak', 'spear', 'speed', 'spell', 'spend', 'spent',
  'spice', 'spicy', 'spine', 'split', 'spoke', 'spoon', 'sport', 'spray', 'squad', 'stack',
  'staff', 'stage', 'stain', 'stair', 'stake', 'stamp', 'stand', 'stare', 'start', 'state',
  'steam', 'steel', 'steep', 'steer', 'stern', 'stick', 'still', 'stock', 'stone', 'stood',
  'store', 'storm', 'story', 'stove', 'strap', 'straw', 'strip', 'stuck', 'study', 'stuff',
  'style', 'sugar', 'suite', 'sunny', 'super', 'surge', 'sweet', 'swift', 'swing', 'sword',
  'table', 'taken', 'taste', 'teach', 'teeth', 'tempo', 'tenth', 'thank', 'theft', 'their',
  'theme', 'there', 'these', 'thick', 'thief', 'thing', 'think', 'third', 'those', 'three',
  'throw', 'thumb', 'tiger', 'tight', 'timer', 'tired', 'title', 'toast', 'today', 'token',
  'tooth', 'topic', 'torch', 'total', 'touch', 'tough', 'tower', 'toxic', 'trace', 'track',
  'trade', 'trail', 'train', 'trait', 'trash', 'treat', 'trend', 'trial', 'tribe', 'trick',
  'tried', 'truck', 'truly', 'trunk', 'trust', 'truth', 'tumor', 'tutor', 'twice', 'twist',
  'uncle', 'under', 'union', 'unite', 'unity', 'until', 'upper', 'upset', 'urban', 'usage',
  'usual', 'valid', 'value', 'valve', 'vapor', 'vault', 'venue', 'verse', 'video', 'vigor',
  'villa', 'vinyl', 'virus', 'visit', 'vital', 'vivid', 'vocal', 'voice', 'voter', 'wagon',
  'waist', 'waste', 'watch', 'water', 'weary', 'weave', 'wedge', 'weigh', 'weird', 'whale',
  'wheat', 'wheel', 'where', 'which', 'while', 'white', 'whole', 'whose', 'widow', 'width',
  'witch', 'woman', 'world', 'worry', 'worse', 'worst', 'worth', 'would', 'wound', 'wrist',
  'write', 'wrong', 'wrote', 'yield', 'young', 'youth', 'zebra',
]

type Mark = 'hit' | 'near' | 'miss'
type Guess = { word: string; marks: Mark[] }

const pickAnswer = () => WORDS[Math.floor(Math.random() * WORDS.length)]

function score(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(LENGTH).fill('miss')
  const counts: Record<string, number> = {}
  for (const letter of answer) counts[letter] = (counts[letter] ?? 0) + 1
  for (let i = 0; i < LENGTH; i += 1) {
    if (guess[i] === answer[i]) {
      marks[i] = 'hit'
      counts[guess[i]] -= 1
    }
  }
  for (let i = 0; i < LENGTH; i += 1) {
    if (marks[i] === 'hit') continue
    if (counts[guess[i]] > 0) {
      marks[i] = 'near'
      counts[guess[i]] -= 1
    }
  }
  return marks
}

export default function WordleGame() {
  const [answer, setAnswer] = useState(pickAnswer)
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing')
  const [message, setMessage] = useState('')

  const letters = useMemo(() => {
    const best: Record<string, Mark> = {}
    const rank: Record<Mark, number> = { miss: 0, near: 1, hit: 2 }
    guesses.forEach((guess) => {
      guess.word.split('').forEach((letter, index) => {
        const mark = guess.marks[index]
        if (!best[letter] || rank[mark] > rank[best[letter]]) best[letter] = mark
      })
    })
    return best
  }, [guesses])

  function submit() {
    if (status !== 'playing') return
    if (draft.length !== LENGTH) {
      setMessage('Not enough letters')
      play('error')
      return
    }
    if (!WORDS.includes(draft)) {
      setMessage('Not in word list')
      play('error')
      return
    }
    const next = [...guesses, { word: draft, marks: score(draft, answer) }]
    setGuesses(next)
    setDraft('')
    setMessage('')
    if (draft === answer) {
      setStatus('won')
      play('win')
    } else if (next.length === ROWS) {
      setStatus('lost')
      play('draw')
    } else {
      play('move')
    }
  }

  function press(key: string) {
    if (status !== 'playing') return
    if (key === 'enter') submit()
    else if (key === 'backspace') {
      play('key')
      setDraft((value) => value.slice(0, -1))
    } else if (/^[a-z]$/.test(key) && draft.length < LENGTH) {
      play('key')
      setDraft((value) => value + key)
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'enter' || key === 'backspace' || /^[a-z]$/.test(key)) {
        event.preventDefault()
        press(key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function restart() {
    setAnswer(pickAnswer())
    setGuesses([])
    setDraft('')
    setStatus('playing')
    setMessage('')
  }

  const label =
    status === 'won'
      ? `Solved in ${guesses.length} ${guesses.length === 1 ? 'try' : 'tries'}`
      : status === 'lost'
        ? `The word was ${answer.toUpperCase()}`
        : `${ROWS - guesses.length} tries left`

  return (
    <div className="ply-game wordle">
      <p className={`ply-game__status${status !== 'playing' ? ' is-done' : ''}`}>{label}</p>

      <div className="wordle__grid">
        {Array.from({ length: ROWS }, (_, row) => {
          const guess = guesses[row]
          const word = guess ? guess.word : row === guesses.length ? draft : ''
          return Array.from({ length: LENGTH }, (_, col) => {
            const letter = word[col] ?? ''
            const mark = guess ? guess.marks[col] : ''
            return (
              <span
                key={`${row}-${col}`}
                className={`wordle__tile ${(row + col) % 2 === 0 ? 'is-light' : 'is-dark'}${mark ? ` is-${mark}` : ''}${
                  letter ? ' is-filled' : ''
                }`}
              >
                {letter.toUpperCase()}
              </span>
            )
          })
        })}
      </div>

      {message && <p className="wordle__message">{message}</p>}

      <div className="wordle__keys">
        {KEY_ROWS.map((row, index) => (
          <div key={row} className="wordle__key-row">
            {index === 2 && (
              <button type="button" className="wordle__key is-enter" onClick={() => press('enter')}>
                Enter
              </button>
            )}
            {row.split('').map((letter, keyIndex) => (
              <button
                key={letter}
                type="button"
                className={`wordle__key ${(index + keyIndex) % 2 === 0 ? 'is-light' : 'is-dark'}${
                  letters[letter] ? ` is-${letters[letter]}` : ''
                }`}
                onClick={() => press(letter)}
              >
                {letter.toUpperCase()}
              </button>
            ))}
            {index === 2 && (
              <button type="button" className="wordle__key is-enter" onClick={() => press('backspace')} aria-label="Delete">
                ⌫
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="ply-game__actions">
        <button type="button" className="ply-btn" onClick={restart}>
          New word
        </button>
      </div>
    </div>
  )
}
