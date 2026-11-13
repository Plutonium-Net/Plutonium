/**
 * Tab sync, ported from v1 (js/account.js: _getTabsSnapshot / pushTabs / pullTabs
 * / scheduleTabSync, and js/navigation.js: restoreTabs).
 *
 * The shape here is deliberately v1's, so both apps read and write the same
 * document: `tabs/_default` holding `{ list: [{ url, title, active }], lastSync }`,
 * mirrored locally into `plu_tabs` (with v1's `cg_tabs` legacy migration).
 */

import { getDoc, isSignedIn, setDoc } from './cloud-store'

export type TabRecord = {
  url: string
  title: string
  active: boolean
}

const TABS_KEY = 'plu_tabs'
const LEGACY_TABS_KEY = 'cg_tabs'
const SYNC_DEBOUNCE_MS = 1500

function normalise(raw: unknown): TabRecord[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const records = raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      url: typeof item.url === 'string' ? item.url : 'newtab',
      title: typeof item.title === 'string' ? item.title : 'New Tab',
      active: item.active === true,
    }))
  return records.length ? records : null
}

export function loadTabs(): TabRecord[] | null {
  try {
    if (!localStorage.getItem(TABS_KEY)) {
      const legacy = localStorage.getItem(LEGACY_TABS_KEY)
      if (legacy) localStorage.setItem(TABS_KEY, legacy)
    }
    const raw = localStorage.getItem(TABS_KEY)
    if (!raw) return null
    return normalise(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveTabs(records: TabRecord[]) {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(records))
  } catch {
    /* quota or private mode: local persistence is best effort */
  }
}

let lastPushedHash = ''
let pushTimer: number | null = null

export async function pushTabs(records: TabRecord[]) {
  if (!isSignedIn()) return
  const hash = JSON.stringify(records)
  if (hash === lastPushedHash) return
  try {
    await setDoc('tabs', { list: records, lastSync: new Date() })
    lastPushedHash = hash
  } catch (err) {
    console.warn('[tabs] Push failed:', err)
  }
}

/** v1 debounces a tab push by 1.5s after the last change. */
export function schedulePush(records: TabRecord[]) {
  if (pushTimer) window.clearTimeout(pushTimer)
  pushTimer = window.setTimeout(() => {
    void pushTabs(records)
  }, SYNC_DEBOUNCE_MS)
}

export async function pullTabs(): Promise<TabRecord[] | null> {
  if (!isSignedIn()) return null
  try {
    const doc = await getDoc('tabs')
    const records = doc ? normalise(doc.list) : null
    if (!records) return null
    saveTabs(records)
    return records
  } catch (err) {
    console.warn('[tabs] Pull failed:', err)
    return null
  }
}
