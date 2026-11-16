import { onAuthChange } from '@/lib/cloud-store'
import { getPref, loadPrefs, setPref } from '@/lib/prefs'
import { BACKGROUNDS } from './registry'

export const DAILY = 'daily'

export const DEFAULT_BACKGROUND = 'soft-aurora'

const STORE_KEY = 'plu_background'
const PREF_KEY = 'background'

const known = (id: string) => id === DAILY || BACKGROUNDS.some((option) => option.id === id)

function readCached(): string {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    return raw && known(raw) ? raw : DEFAULT_BACKGROUND
  } catch {
    return DEFAULT_BACKGROUND
  }
}

let choice = readCached()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function adopt(id: unknown) {
  if (typeof id !== 'string' || !known(id) || id === choice) return
  choice = id
  emit()
}

export function getBackgroundChoice() {
  return choice
}

export function subscribeBackground(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function selectBackground(id: string) {
  if (!known(id) || id === choice) return
  choice = id
  try {
    sessionStorage.setItem(STORE_KEY, id)
  } catch {
  }
  setPref(PREF_KEY, id)
  emit()
}

void loadPrefs().then(() => adopt(getPref<string>(PREF_KEY)))
onAuthChange((user) => {
  if (!user) return
  void loadPrefs().then(() => adopt(getPref<string>(PREF_KEY)))
})
