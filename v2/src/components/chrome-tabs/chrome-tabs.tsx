import { useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
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
}

type DragState = {
  id: string
  el: HTMLDivElement
  startX: number
  grabOffsetX: number
  moved: boolean
}

const DRAG_THRESHOLD_PX = 4
const REORDER_TRANSITION_MS = 120

/** Tab geometry is drawn once for the strip; each inactive tab references it by id. */
function TabGeometryDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <defs>
        <symbol id="chrome-tab-geometry-left-inactive" viewBox="0 0 214 36">
          <path d="M17 0h197v32H17c-4.5 0-8-3.5-8-8V8c0-4.5 3.5-8 8-8z" />
        </symbol>
        <symbol id="chrome-tab-geometry-right-inactive" viewBox="0 0 214 36">
          <use href="#chrome-tab-geometry-left-inactive" />
        </symbol>
      </defs>
    </svg>
  )
}

export default function ChromeTabs({ tabs, activeId, onSelect, onAdd, onClose, onReorder }: ChromeTabsProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
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
    const contentRect = contentRef.current?.getBoundingClientRect()
    if (!contentRect) return
    const slotLeft = contentRect.left + state.el.offsetLeft
    state.el.style.transform = `translateX(${clientX - state.grabOffsetX - slotLeft}px)`
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>, tab: Tab) {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.chrome-tab-close')) return
    const rect = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      id: tab.id,
      el: event.currentTarget,
      startX: event.clientX,
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

    if (!state.moved) {
      if (Math.abs(clientX - state.startX) < DRAG_THRESHOLD_PX) return
      state.moved = true
      setDraggingId(state.id)
    }

    const currentIndex = tabEls().indexOf(state.el)
    const slot = slotFor(clientX, state.el)
    if (currentIndex !== -1 && slot !== currentIndex) {
      captureRects()
      onReorder(currentIndex, slot)
    }

    requestAnimationFrame(() => trackPointer(state, clientX))
  }

  function endDrag() {
    const state = dragRef.current
    dragRef.current = null
    if (!state) return
    setDraggingId(null)
    if (!state.moved) return
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

  return (
    <div className="chrome-tabs">
      <TabGeometryDefs />
      <div className="chrome-tabs-content" ref={contentRef} onDoubleClick={handleStripDoubleClick}>
        {tabs.map((tab) => {
          const active = tab.id === activeId
          const dragging = tab.id === draggingId
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
            >
              <div className="chrome-tab-dividers" />
              <div className="chrome-tab-highlight" />
              <div className="chrome-tab-background">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg">
                  <g className="tab-inactive-svg">
                    <svg width="50%" height="100%">
                      <use
                        href="#chrome-tab-geometry-left-inactive"
                        width="214"
                        height="36"
                        className="chrome-tab-geometry"
                      />
                    </svg>
                    <g transform="scale(-1,1)">
                      <svg width="50%" height="100%" x="-100%" y="0">
                        <use
                          href="#chrome-tab-geometry-right-inactive"
                          width="214"
                          height="36"
                          className="chrome-tab-geometry"
                        />
                      </svg>
                    </g>
                  </g>
                </svg>
              </div>
              <div className="chrome-tab-content">
                <div className="chrome-tab-favicon" />
                <div className="chrome-tab-title">{tab.title}</div>
                <div className="chrome-tab-drag-handle" />
                <div
                  className="chrome-tab-close"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onClose(tab.id)
                  }}
                />
              </div>
            </div>
          )
        })}
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
      </div>
    </div>
  )
}
