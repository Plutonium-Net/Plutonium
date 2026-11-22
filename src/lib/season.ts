import { getBackgroundChoice, selectBackground } from '@/components/backgrounds/background-store'
import { getAccent, selectAccent } from './accent'
import { onAuthChange } from './cloud-store'
import { getPref, loadPrefs, setPref } from './prefs'

export type SeasonId = 'halloween' | 'thanksgiving' | 'winter'

export type Season = {
  id: SeasonId
  name: string
  accent: string
  background: string
}

export const SEASONS: Season[] = [
  { id: 'halloween', name: 'Halloween', accent: 'orange', background: 'scene-halloween' },
  { id: 'thanksgiving', name: 'Thanksgiving', accent: 'amber', background: 'scene-thanksgiving' },
  { id: 'winter', name: 'Winter', accent: 'blue', background: 'scene-winter-village' },
]

const STORE_KEY = 'plu_seasonal'
const CUSTOM_KEY = 'plu_seasonal_custom'
const PREF_KEY = 'seasonal'
const CUSTOM_PREF_KEY = 'seasonalCustom'

type Custom = { accent: string; background: string }

const find = (id: string) => SEASONS.find((season) => season.id === id)

/** The preset for the current month: October, November, and December through January. */
export function seasonFor(date = new Date()): Season | null {
  const month = date.getMonth()
  if (month === 9) return find('halloween') ?? null
  if (month === 10) return find('thanksgiving') ?? null
  if (month === 11 || month === 0) return find('winter') ?? null
  return null
}

function parseCustom(value: unknown): Custom | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<Custom>
  return typeof entry.accent === 'string' && typeof entry.background === 'string'
    ? { accent: entry.accent, background: entry.background }
    : null
}

function readEnabled(): boolean {
  try {
    return sessionStorage.getItem(STORE_KEY) === '1'
  } catch {
    return false
  }
}

function readCustom(): Custom | null {
  try {
    const raw = sessionStorage.getItem(CUSTOM_KEY)
    return raw ? parseCustom(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

let enabled = readEnabled()
let custom = readCustom()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function apply(season: Season | null) {
  if (!season) return
  selectAccent(season.accent)
  selectBackground(season.background)
}

function saveCustom(value: Custom) {
  custom = value
  try {
    sessionStorage.setItem(CUSTOM_KEY, JSON.stringify(value))
  } catch {
  }
  setPref(CUSTOM_PREF_KEY, value)
}

export function getSeasonal() {
  return enabled
}

export function subscribeSeasonal(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setSeasonal(next: boolean) {
  if (next === enabled) return
  enabled = next
  try {
    sessionStorage.setItem(STORE_KEY, next ? '1' : '0')
  } catch {
  }
  setPref(PREF_KEY, next)

  if (next) {
    // Remember what the user had so turning the switch back off restores it.
    saveCustom({ accent: getAccent().id, background: getBackgroundChoice() })
    apply(seasonFor())
  } else if (custom) {
    selectAccent(custom.accent)
    selectBackground(custom.background)
  }

  emit()
}

function adopt(state: unknown, saved: unknown) {
  const stored = parseCustom(saved)
  if (stored && !custom) custom = stored

  const next = state === true
  if (next === enabled) return
  enabled = next
  if (enabled) apply(seasonFor())
  else if (custom) {
    selectAccent(custom.accent)
    selectBackground(custom.background)
  }
  emit()
}

void loadPrefs().then(() => adopt(getPref<boolean>(PREF_KEY), getPref<unknown>(CUSTOM_PREF_KEY)))
onAuthChange((user) => {
  if (!user) return
  void loadPrefs().then(() => adopt(getPref<boolean>(PREF_KEY), getPref<unknown>(CUSTOM_PREF_KEY)))
})
