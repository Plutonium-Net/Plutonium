import { onAuthChange } from './cloud-store'
import { getPref, loadPrefs, setPref } from './prefs'

export type Accent = {
  id: string
  name: string
  hex: string
  rgb: [number, number, number]
}

const PALETTE: Array<[string, string, string]> = [
  ['blue', 'Blue', '#5f8bff'],
  ['violet', 'Violet', '#a78bfa'],
  ['cyan', 'Cyan', '#2fe0c8'],
  ['teal', 'Teal', '#2dd4bf'],
  ['green', 'Green', '#5ee07a'],
  ['lime', 'Lime', '#b6e63e'],
  ['amber', 'Amber', '#f6c453'],
  ['orange', 'Orange', '#ff8a3d'],
  ['rose', 'Rose', '#ff6b8a'],
  ['white', 'White', '#ffffff'],
]

const channels = (hex: string): [number, number, number] => {
  const value = parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export const ACCENTS: Accent[] = PALETTE.map(([id, name, hex]) => ({ id, name, hex, rgb: channels(hex) }))

export const DEFAULT_ACCENT = ACCENTS.find((accent) => accent.id === 'white') ?? ACCENTS[0]

const STORE_KEY = 'plu_accent'
const PREF_KEY = 'accent'

function find(id: string): Accent | undefined {
  return ACCENTS.find((accent) => accent.id === id)
}

function apply(accent: Accent) {
  const root = document.documentElement
  root.style.setProperty('--accent', accent.hex)
  root.style.setProperty('--accent-rgb', accent.rgb.join(', '))
}

function readCached(): Accent {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    return (raw && find(raw)) || DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

let current = readCached()
const listeners = new Set<() => void>()

apply(current)

function emit() {
  listeners.forEach((listener) => listener())
}

function adopt(id: unknown) {
  const accent = typeof id === 'string' ? find(id) : undefined
  if (!accent || accent.id === current.id) return
  current = accent
  apply(current)
  emit()
}

export function getAccent() {
  return current
}

export function subscribeAccent(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function selectAccent(id: string) {
  const accent = find(id)
  if (!accent || accent.id === current.id) return
  current = accent
  apply(current)
  try {
    sessionStorage.setItem(STORE_KEY, accent.id)
  } catch {
  }
  setPref(PREF_KEY, accent.id)
  emit()
}

void loadPrefs().then(() => adopt(getPref<string>(PREF_KEY)))
onAuthChange((user) => {
  if (!user) return
  void loadPrefs().then(() => adopt(getPref<string>(PREF_KEY)))
})
