import { useCallback, useState } from 'react'

export type Tab = {
  id: string
  title: string
}

let nextTabId = 1

function createTab(): Tab {
  return { id: `tab-${nextTabId++}`, title: 'New Tab' }
}

type TabsState = {
  tabs: Tab[]
  activeId: string
}

export function useTabs() {
  const [{ tabs, activeId }, setState] = useState<TabsState>(() => {
    const first = createTab()
    return { tabs: [first], activeId: first.id }
  })

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
