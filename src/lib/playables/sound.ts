// Sound for the playable games. Everything is synthesised with the Web Audio
// API, so there are no audio files to ship or wait for. The context is created
// lazily on the first call, which always comes from a click or key press, so
// browsers do not block it.
import { useEffect, useState } from 'react'

export type SoundName =
  | 'select'
  | 'move'
  | 'capture'
  | 'castle'
  | 'check'
  | 'promote'
  | 'win'
  | 'draw'
  | 'drop'
  | 'hit'
  | 'miss'
  | 'sink'
  | 'reveal'
  | 'flag'
  | 'boom'
  | 'key'
  | 'error'
  | 'chime'

type Tone = {
  /** Start frequency in Hz. */
  f: number
  /** Optional glide target in Hz. */
  to?: number
  /** Seconds. */
  dur: number
  type?: OscillatorType
  gain?: number
  /** Delay after the sound starts, in seconds. */
  at?: number
}

type Noise = { dur: number; gain?: number; at?: number; freq?: number }

type Recipe = { tones?: Tone[]; noise?: Noise[] }

const RECIPES: Record<SoundName, Recipe> = {
  select: { tones: [{ f: 520, to: 620, dur: 0.05, type: 'triangle', gain: 0.05 }] },
  move: {
    tones: [{ f: 190, to: 140, dur: 0.09, type: 'sine', gain: 0.1 }],
    noise: [{ dur: 0.045, gain: 0.05, freq: 1800 }],
  },
  capture: {
    tones: [{ f: 130, to: 55, dur: 0.18, type: 'square', gain: 0.09 }],
    noise: [{ dur: 0.16, gain: 0.14, freq: 900 }],
  },
  castle: {
    tones: [
      { f: 200, dur: 0.07, type: 'sine', gain: 0.09 },
      { f: 260, dur: 0.08, type: 'sine', gain: 0.09, at: 0.07 },
    ],
    noise: [{ dur: 0.03, gain: 0.04, freq: 2000 }],
  },
  check: {
    tones: [
      { f: 880, dur: 0.09, type: 'triangle', gain: 0.08 },
      { f: 1175, dur: 0.12, type: 'triangle', gain: 0.08, at: 0.09 },
    ],
  },
  promote: {
    tones: [
      { f: 523, dur: 0.12, type: 'triangle', gain: 0.09 },
      { f: 659, dur: 0.12, type: 'triangle', gain: 0.09, at: 0.07 },
      { f: 784, dur: 0.12, type: 'triangle', gain: 0.09, at: 0.14 },
      { f: 1047, dur: 0.26, type: 'triangle', gain: 0.1, at: 0.21 },
    ],
  },
  win: {
    tones: [
      { f: 523, dur: 0.16, type: 'sine', gain: 0.1 },
      { f: 659, dur: 0.16, type: 'sine', gain: 0.1, at: 0.11 },
      { f: 784, dur: 0.16, type: 'sine', gain: 0.1, at: 0.22 },
      { f: 1047, dur: 0.34, type: 'sine', gain: 0.11, at: 0.33 },
    ],
  },
  draw: {
    tones: [
      { f: 440, to: 392, dur: 0.18, type: 'sine', gain: 0.08 },
      { f: 330, dur: 0.28, type: 'sine', gain: 0.08, at: 0.16 },
    ],
  },
  drop: {
    tones: [{ f: 300, to: 120, dur: 0.16, type: 'sine', gain: 0.11 }],
    noise: [{ dur: 0.06, gain: 0.06, freq: 1200 }],
  },
  hit: {
    tones: [{ f: 95, to: 40, dur: 0.24, type: 'square', gain: 0.11 }],
    noise: [{ dur: 0.22, gain: 0.18, freq: 700 }],
  },
  miss: {
    tones: [{ f: 240, to: 170, dur: 0.12, type: 'sine', gain: 0.07 }],
    noise: [{ dur: 0.09, gain: 0.05, freq: 2400 }],
  },
  sink: {
    tones: [
      { f: 170, to: 60, dur: 0.4, type: 'sawtooth', gain: 0.08 },
      { f: 90, to: 38, dur: 0.44, type: 'sine', gain: 0.1, at: 0.04 },
    ],
    noise: [{ dur: 0.3, gain: 0.12, freq: 500 }],
  },
  reveal: { tones: [{ f: 740, to: 520, dur: 0.07, type: 'triangle', gain: 0.06 }] },
  flag: {
    tones: [
      { f: 900, dur: 0.045, type: 'triangle', gain: 0.06 },
      { f: 1250, dur: 0.05, type: 'triangle', gain: 0.055, at: 0.045 },
    ],
  },
  boom: {
    tones: [{ f: 80, to: 28, dur: 0.55, type: 'sine', gain: 0.14 }],
    noise: [{ dur: 0.5, gain: 0.2, freq: 400 }],
  },
  key: { tones: [{ f: 640, dur: 0.028, type: 'square', gain: 0.035 }] },
  chime: {
    tones: [
      { f: 784, dur: 0.08, type: 'triangle', gain: 0.07 },
      { f: 1047, dur: 0.12, type: 'triangle', gain: 0.07, at: 0.07 },
    ],
  },
  error: { tones: [{ f: 230, to: 180, dur: 0.13, type: 'square', gain: 0.07 }] },
}

const STORAGE_KEY = 'plutonium.playables.sound'

let context: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null

function readMuted() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'off'
  } catch {
    return false
  }
}

let muted = readMuted()
const listeners = new Set<(muted: boolean) => void>()

export function isMuted() {
  return muted
}

export function setMuted(next: boolean) {
  muted = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'off' : 'on')
  } catch {
    // Private mode or a blocked store: the choice just does not persist.
  }
  listeners.forEach((listener) => listener(muted))
}

export function subscribeMuted(listener: (muted: boolean) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Mute state for UI toggles; shared across every game. */
export function useMuted() {
  const [value, setValue] = useState(readMuted)
  useEffect(() => subscribeMuted(setValue), [])
  return [value, () => setMuted(!value)] as const
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!context) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      context = new Ctor()
    } catch {
      return null
    }
  }
  if (context.state === 'suspended') void context.resume().catch(() => undefined)
  return context
}

function noise(ctx: AudioContext) {
  if (!noiseBuffer) {
    const length = Math.floor(ctx.sampleRate * 0.6)
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
  }
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer
  return source
}

/** Play one of the named effects. Safe to call from any handler; never throws. */
export function play(name: SoundName) {
  if (muted) return
  const ctx = audio()
  if (!ctx) return

  const recipe = RECIPES[name]
  const start = ctx.currentTime + 0.001
  const master = ctx.createGain()
  master.gain.value = 0.9
  master.connect(ctx.destination)

  for (const tone of recipe.tones ?? []) {
    const at = start + (tone.at ?? 0)
    const end = at + tone.dur
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = tone.type ?? 'sine'
    osc.frequency.setValueAtTime(tone.f, at)
    if (tone.to && tone.to !== tone.f) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, tone.to), end)
    }
    const peak = tone.gain ?? 0.1
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.02, tone.dur * 0.3))
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    osc.connect(gain).connect(master)
    osc.start(at)
    osc.stop(end + 0.03)
  }

  for (const burst of recipe.noise ?? []) {
    const at = start + (burst.at ?? 0)
    const source = noise(ctx)
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    filter.type = 'bandpass'
    filter.frequency.value = burst.freq ?? 1200
    filter.Q.value = 0.9
    gain.gain.setValueAtTime(burst.gain ?? 0.1, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + burst.dur)
    source.connect(filter).connect(gain).connect(master)
    source.start(at)
    source.stop(at + burst.dur + 0.02)
  }
}
