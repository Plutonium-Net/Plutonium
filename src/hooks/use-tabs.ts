import { useCallback, useEffect, useRef, useState } from 'react'
import { isSignedIn, onAuthChange } from '@/lib/cloud-store'
import { recordVisit } from '@/lib/history'
import { engineLabel } from '@/lib/net/engines'
import { getNet } from '@/lib/net/net-store'
import { endRemoteSession, startRemoteSession } from '@/lib/net/remote'
import { normalizeInput, titleFor } from '@/lib/net/url'
import { resolveUrl } from '@/lib/pluto-routes'
import { pullTabs, schedulePush, type TabRecord } from '@/lib/tab-sync'

export type Tab = {
  id: string
  title: string
  url: string
  frameUrl?: string
  entries: string[]
  index: number
}

type TabsState = {
  tabs: Tab[]
  activeId: string
}

let nextTabId = 1

function createTab(record?: TabRecord): Tab {
  const url = record?.url || 'newtab'
  return {
    id: `tab-${nextTabId++}`,
    title: record?.title || 'New Tab',
    url,
    entries: [url],
    index: 0,
  }
}

function toRecords(tabs: Tab[], activeId: string): TabRecord[] {
  return tabs.map((tab) => ({ url: tab.url, title: tab.title, active: tab.id === activeId }))
}

function freshState(): TabsState {
  const first = createTab()
  return { tabs: [first], activeId: first.id }
}

async function remoteFrameUrl(url: string) {
  const session = await startRemoteSession(url)
  return session
}

export function useTabs() {
  const [state, setState] = useState<TabsState>(freshState)
  const [signedIn, setSignedIn] = useState(isSignedIn)
  const [syncReady, setSyncReady] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state
  const sessionsRef = useRef(new Map<string, string>())

  const { tabs, activeId } = state

  useEffect(() => onAuthChange((user) => setSignedIn(!!user)), [])

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
    const sessionId = sessionsRef.current.get(id)
    if (sessionId) {
      sessionsRef.current.delete(id)
      void endRemoteSession(sessionId)
    }
    setState((prev) => {
      const index = prev.tabs.findIndex((tab) => tab.id === id)
      if (index === -1) return prev

      const remaining = prev.tabs.filter((tab) => tab.id !== id)
      if (remaining.length === 0) {
        const replacement = createTab()
        return { tabs: [replacement], activeId: replacement.id }
      }

      if (prev.activeId !== id) return { ...prev, tabs: remaining }

      const neighbour = remaining[Math.min(index, remaining.length - 1)]
      return { tabs: remaining, activeId: neighbour.id }
    })
  }, [])

  const applyUrl = useCallback((tabId: string, url: string, title: string, frameUrl?: string) => {
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((tab) => {
        if (tab.id !== tabId) return tab
        const entries = [...tab.entries.slice(0, tab.index + 1), url]
        return { ...tab, url, title, frameUrl, entries, index: entries.length - 1 }
      }),
    }))
  }, [])

  const navigate = useCallback(
    async (input: string) => {
      const current = stateRef.current
      const tab = current.tabs.find((item) => item.id === current.activeId)
      if (!tab) return false

      const page = resolveUrl(input)
      if (page) {
        applyUrl(tab.id, page.url, page.title)
        return true
      }

      const normalized = normalizeInput(input)
      if (!normalized) return false

      const engine = getNet().engine
      let frameUrl: string | undefined
      if (engine === 'remote') {
        const session = await remoteFrameUrl(normalized.url)
        if (!session) return false
        const previous = sessionsRef.current.get(tab.id)
        if (previous) void endRemoteSession(previous)
        if (session.sessionId) sessionsRef.current.set(tab.id, session.sessionId)
        frameUrl = session.embedUrl
      }

      const title = titleFor(normalized.url)
      applyUrl(tab.id, normalized.url, title, frameUrl)
      recordVisit({
        type: normalized.type,
        title,
        href: normalized.url,
        engine: engineLabel(engine),
      })
      return true
    },
    [applyUrl],
  )

  const goTo = useCallback(async (tabId: string, index: number) => {
    const tab = stateRef.current.tabs.find((item) => item.id === tabId)
    if (!tab || index < 0 || index >= tab.entries.length) return
    const url = tab.entries[index]

    let frameUrl: string | undefined
    if (url !== 'newtab' && getNet().engine === 'remote') {
      const session = await remoteFrameUrl(url)
      if (!session) return
      const previous = sessionsRef.current.get(tabId)
      if (previous) void endRemoteSession(previous)
      if (session.sessionId) sessionsRef.current.set(tabId, session.sessionId)
      frameUrl = session.embedUrl
    }

    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((item) =>
        item.id === tabId ? { ...item, url, title: url === 'newtab' ? 'New Tab' : titleFor(url), frameUrl, index } : item,
      ),
    }))
  }, [])

  const back = useCallback(
    (tabId: string) => {
      const tab = stateRef.current.tabs.find((item) => item.id === tabId)
      if (!tab || tab.index <= 0) return
      void goTo(tabId, tab.index - 1)
    },
    [goTo],
  )

  const forward = useCallback(
    (tabId: string) => {
      const tab = stateRef.current.tabs.find((item) => item.id === tabId)
      if (!tab || tab.index >= tab.entries.length - 1) return
      void goTo(tabId, tab.index + 1)
    },
    [goTo],
  )

  const moveTab = useCallback((from: number, to: number) => {
    setState((prev) => {
      if (from === to || from < 0 || from >= prev.tabs.length) return prev
      const next = [...prev.tabs]
      const [moved] = next.splice(from, 1)
      next.splice(Math.max(0, Math.min(next.length, to)), 0, moved)
      return { ...prev, tabs: next }
    })
  }, [])

  return { tabs, activeId, addTab, selectTab, closeTab, moveTab, navigate, back, forward }
}
