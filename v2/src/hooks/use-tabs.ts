import { useCallback, useEffect, useState } from 'react'
import { isSignedIn, onAuthChange } from '@/lib/cloud-store'
import { pullTabs, schedulePush, type TabRecord } from '@/lib/tab-sync'

export type Tab = {
  id: string
  title: string
  url: string
}

type TabsState = {
  tabs: Tab[]
  activeId: string
}

let nextTabId = 1

function createTab(record?: TabRecord): Tab {
  return {
    id: `tab-${nextTabId++}`,
    title: record?.title || 'New Tab',
    url: record?.url || 'newtab',
  }
}

/** v1's snapshot shape: one record per tab, the active one flagged. */
function toRecords(tabs: Tab[], activeId: string): TabRecord[] {
  return tabs.map((tab) => ({ url: tab.url, title: tab.title, active: tab.id === activeId }))
}

function freshState(): TabsState {
  const first = createTab()
  return { tabs: [first], activeId: first.id }
}

export function useTabs() {
  // Nothing is restored from the device: a tab list only ever arrives from the cloud.
  const [state, setState] = useState<TabsState>(freshState)
  const [signedIn, setSignedIn] = useState(isSignedIn)
  const [syncReady, setSyncReady] = useState(false)

  const { tabs, activeId } = state

  useEffect(() => onAuthChange((user) => setSignedIn(!!user)), [])

  // Adopt the remote list when a session appears; pushes wait for it to settle
  // so fresh local tabs can never overwrite another device's list.
  useEffect(() => {
    if (!signedIn) {
      setSyncReady(false)
      return
    }
    let cancelled = false
    setSyncReady(false)
    void pullTabs()
      .then((remote) => {
        if (cancelled || !remote) return
        const restored = remote.map((record) => createTab(record))
        const activeIndex = Math.max(0, remote.findIndex((record) => record.active))
        setState({ tabs: restored, activeId: restored[activeIndex].id })
      })
      .finally(() => {
        if (!cancelled) setSyncReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [signedIn])

  useEffect(() => {
    if (!signedIn || !syncReady) return
    schedulePush(toRecords(tabs, activeId))
  }, [tabs, activeId, signedIn, syncReady])

  const addTab = useCallback(() => {
    const tab = createTab()
    setState((prev) => ({ tabs: [...prev.tabs, tab], activeId: tab.id }))
  }, [])

  const selectTab = useCallback((id: string) => {
    setState((prev) => (prev.activeId === id ? prev : { ...prev, activeId: id }))
  }, [])

  const closeTab = useCallback((id: string) => {
    setState((prev) => {
      const index = prev.tabs.findIndex((tab) => tab.id === id)
      if (index === -1) return prev

      const remaining = prev.tabs.filter((tab) => tab.id !== id)
      // Closing the last tab leaves a fresh one behind, never an empty window.
      if (remaining.length === 0) {
        const replacement = createTab()
        return { tabs: [replacement], activeId: replacement.id }
      }

      // A closed background tab keeps the current selection.
      if (prev.activeId !== id) return { ...prev, tabs: remaining }

      // A closed active tab hands over to its neighbour, preferring the right.
      const neighbour = remaining[Math.min(index, remaining.length - 1)]
      return { tabs: remaining, activeId: neighbour.id }
    })
  }, [])

  /** `to` is the slot in the list with the moved tab already taken out. */
  const moveTab = useCallback((from: number, to: number) => {
    setState((prev) => {
      if (from === to || from < 0 || from >= prev.tabs.length) return prev
      const next = [...prev.tabs]
      const [moved] = next.splice(from, 1)
      next.splice(Math.max(0, Math.min(next.length, to)), 0, moved)
      return { ...prev, tabs: next }
    })
  }, [])

  return { tabs, activeId, addTab, selectTab, closeTab, moveTab }
}
