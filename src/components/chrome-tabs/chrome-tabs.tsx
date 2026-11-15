import { useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { BorderBeam } from 'border-beam'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import TabFavicon from '@/components/tab-favicon/tab-favicon'
import { BEAM_PROPS } from '@/lib/beam'
import { cn } from '@/lib/utils'
import type { Tab } from '@/hooks/use-tabs'
import './chrome-tabs.css'

type ChromeTabsProps = {
  tabs: Tab[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onReorder: (from: number, to: number) => void
  /** Home screen: the button leaves the strip and docks centred under it. */
  addCentered?: boolean
}

type DragState = {
  id: string
  el: HTMLDivElement
  startX: number
  lastX: number
  grabOffsetX: number
  moved: boolean
}

const DRAG_THRESHOLD_PX = 4
const REORDER_TRANSITION_MS = 120

export default function ChromeTabs({
  tabs,
  activeId,
  onSelect,
  onAdd,
  onClose,
  onReorder,
  addCentered = false,
}: ChromeTabsProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  const previousRectsRef = useRef<Map<string, number> | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // FLIP: neighbours slide from where they were to where they now sit. The
  // dragged tab tracks the pointer itself, so it is skipped.
  useLayoutEffect(() => {
    const previous = previousRectsRef.current
    if (!previous) return
    previousRectsRef.current = null

    const tabEls = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('.chrome-tab') ?? [])
    tabEls.forEach((el) => {
      if (dragRef.current?.el === el) return
      const before = previous.get(el.dataset.tabId || '')
      if (before === undefined) return
      const delta = before - el.getBoundingClientRect().left
      if (!delta) return
      el.style.transition = 'none'
      el.style.transform = `translateX(${delta}px)`
      requestAnimationFrame(() => {
        el.style.transition = `transform ${REORDER_TRANSITION_MS}ms ease-in-out`
        el.style.transform = ''
        window.setTimeout(() => {
          el.style.transition = ''
        }, REORDER_TRANSITION_MS + 20)
      })
    })
  }, [tabs])

  function tabEls() {
    return Array.from(contentRef.current?.querySelectorAll<HTMLElement>('.chrome-tab') ?? [])
  }

  function captureRects() {
    const rects = new Map<string, number>()
    tabEls().forEach((el) => {
      if (el.dataset.tabId) rects.set(el.dataset.tabId, el.getBoundingClientRect().left)
    })
    previousRectsRef.current = rects
  }

  /** Slot the tab lands in once lifted out: count the other tabs the pointer passed. */
  function slotFor(clientX: number, draggedEl: HTMLElement) {
    let slot = 0
    tabEls().forEach((el) => {
      if (el === draggedEl) return
      const rect = el.getBoundingClientRect()
      if (clientX > rect.left + rect.width / 2) slot += 1
    })
    return slot
  }

  function trackPointer(state: DragState, clientX: number) {
    if (dragRef.current !== state) return
    const contentRect = contentRef.current?.getBoundingClientRect()
    if (!contentRect) return
    const slotLeft = contentRect.left + state.el.offsetLeft
    state.el.style.transform = `translateX(${clientX - state.grabOffsetX - slotLeft}px)`
  }

  function queueTrack(state: DragState, clientX: number) {
    // One frame at a time, and always cancellable: a frame left in flight after
    // the drop would re-stamp the tab at the cursor and it would hang there.
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current)
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null
      trackPointer(state, clientX)
    })
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>, tab: Tab) {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.chrome-tab-close')) return
    const rect = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      id: tab.id,
      el: event.currentTarget,
      startX: event.clientX,
      lastX: event.clientX,
      grabOffsetX: event.clientX - rect.left,
      moved: false,
    }
    // Capture keeps the drag alive when the pointer leaves the tab; a synthetic
    // pointer (tests, automation) has no real pointer to capture and throws.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* no capturable pointer */
    }
    onSelect(tab.id)
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const state = dragRef.current
    if (!state) return
    const clientX = event.clientX
    state.lastX = clientX

    if (!state.moved) {
      if (Math.abs(clientX - state.startX) < DRAG_THRESHOLD_PX) return
      state.moved = true
      setDraggingId(state.id)
    }

    // The tab only follows the pointer. No slot is committed while it is held
    // down — the drop decides where it lands, like v1's Draggabilly port.
    queueTrack(state, clientX)
  }

  function endDrag() {
    const state = dragRef.current
    dragRef.current = null
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }
    if (!state) return
    setDraggingId(null)

    if (!state.moved) {
      state.el.style.transform = ''
      return
    }

    const from = tabEls().indexOf(state.el)
    const to = slotFor(state.lastX, state.el)
    // Record where every tab sits visually right now (the dragged one is under
    // the pointer), then commit: the FLIP pass glides it into its new slot and
    // slides the tabs it displaced over.
    captureRects()

    if (from !== -1 && to !== from) {
      state.el.style.transform = ''
      onReorder(from, to)
      return
    }

    // Dropped back where it started: glide into its own slot.
    state.el.style.transition = `transform ${REORDER_TRANSITION_MS}ms ease-in-out`
    state.el.style.transform = ''
    window.setTimeout(() => {
      state.el.style.transition = ''
    }, REORDER_TRANSITION_MS + 20)
  }

  function handleStripDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    // Only empty strip space adds a tab; a double click on a tab belongs to it.
    if (event.target === event.currentTarget) onAdd()
  }

  const newTabButton = (
    <button
      className="chrome-tabs-newtab-btn"
      id="newtab-btn"
      title="New tab"
      aria-label="New tab"
      onClick={onAdd}
    >
      <svg className="newtab-icon" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <line x1="9" y1="2" x2="9" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )

  return (
    <div className={cn('chrome-tabs', addCentered && 'has-centered-add')}>
      <div className="chrome-tabs-content" ref={contentRef} onDoubleClick={handleStripDoubleClick}>
        {tabs.map((tab) => {
          const active = tab.id === activeId
          const dragging = tab.id === draggingId
          const surface = (
            <GlassSurface
              className="chrome-tab-glass"
              width="100%"
              height="100%"
              borderRadius={12}
              backgroundOpacity={active ? 0.18 : 0.06}
              saturation={active ? 1.35 : 1.1}
              displace={0.4}
            >
              <div className="chrome-tab-inner">
                <TabFavicon url={tab.url} />
                <div className="chrome-tab-title">{tab.title}</div>
                <div
                  className="chrome-tab-close"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onClose(tab.id)
                  }}
                />
              </div>
            </GlassSurface>
          )

          return (
            <div
              key={tab.id}
              className={cn('chrome-tab', dragging && 'is-dragging')}
              data-active={active ? '' : undefined}
              data-tab-id={tab.id}
              onPointerDown={(event) => beginDrag(event, tab)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={endDrag}
            >
              {active ? (
                <BorderBeam className="chrome-tab-beam" {...BEAM_PROPS} borderRadius={12}>
                  {surface}
                </BorderBeam>
              ) : (
                surface
              )}
            </div>
          )
        })}
        {!addCentered && newTabButton}
      </div>
      {/* Home screen: the button is docked centred just below the strip instead. */}
      {addCentered && <div className="chrome-tabs-add-dock">{newTabButton}</div>}
    </div>
  )
}
