/**
 * Which wallpaper the shell wears.
 *
 * Daily rotation is the default and needs no storage. Picking one by hand is a
 * preference: it is cached for the tab in sessionStorage so it survives a reload
 * while signed out, and saved to the signed-in account through lib/prefs, which
 * is what carries it to other devices.
 */

import { onAuthChange } from '@/lib/cloud-store'
import { getPref, loadPrefs, setPref } from '@/lib/prefs'
import { BACKGROUNDS } from './registry'

/** The rotating default, as opposed to any single wallpaper's id. */
export const DAILY = 'daily'

const STORE_KEY = 'plu_background'
const PREF_KEY = 'background'

const known = (id: string) => id === DAILY || BACKGROUNDS.some((option) => option.id === id)

function readCached(): string {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    return raw && known(raw) ? raw : DAILY
  } catch {
    return DAILY
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

/** Picks a wallpaper to keep, or hands the shell back to the daily rotation. */
export function selectBackground(id: string) {
  if (!known(id) || id === choice) return
  choice = id
  try {
    sessionStorage.setItem(STORE_KEY, id)
  } catch {
    /* storage blocked: the choice still holds for this page load */
  }
  setPref(PREF_KEY, id)
  emit()
}

// The account copy wins once it arrives, including right after a fresh sign-in.
void loadPrefs().then(() => adopt(getPref<string>(PREF_KEY)))
onAuthChange((user) => {
  if (!user) return
  void loadPrefs().then(() => adopt(getPref<string>(PREF_KEY)))
})
