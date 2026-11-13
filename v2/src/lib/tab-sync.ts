/**
 * Tab sync, ported from v1 (js/account.js: _getTabsSnapshot / pushTabs / pullTabs
 * / scheduleTabSync, and js/navigation.js: restoreTabs).
 *
 * v1 also mirrors this into localStorage under `plu_tabs`. v2 does not: the
 * Firestore document is the only place tabs live, so nothing tab-related is
 * written to the device.
 *
 * The document shape is v1's, so both apps read and write the same record:
 * `tabs/_default` holding `{ list: [{ url, title, active }], lastSync }`.
 */

import { getDoc, isSignedIn, setDoc } from './cloud-store'

export type TabRecord = {
  url: string
  title: string
  active: boolean
}

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

let lastPushedHash = ''
let pushTimer: number | null = null

/** Record what the remote already holds, so a pull is not echoed straight back. */
export function markSynced(records: TabRecord[]) {
  lastPushedHash = JSON.stringify(records)
}

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
    markSynced(records)
    return records
  } catch (err) {
    console.warn('[tabs] Pull failed:', err)
    return null
  }
}
