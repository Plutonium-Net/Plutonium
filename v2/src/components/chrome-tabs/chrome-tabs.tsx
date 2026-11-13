import { useRef, useState } from 'react'
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

const DRAG_THRESHOLD_PX = 4

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
  const dragRef = useRef<{ id: string; index: number; startX: number; moved: boolean } | null>(null)
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null)

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>, tab: Tab, index: number) {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.chrome-tab-close')) return
    dragRef.current = { id: tab.id, index, startX: event.clientX, moved: false }
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
    const dx = event.clientX - state.startX
    if (!state.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return
    state.moved = true
    setDrag({ id: state.id, dx })
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const state = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!state || !state.moved) return

    // Count the other tabs the pointer has passed: that is the slot the tab
    // lands in once it is lifted out of the list.
    const tabEls = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('.chrome-tab') ?? [])
    let target = 0
    tabEls.forEach((el, i) => {
      if (i === state.index) return
      const rect = el.getBoundingClientRect()
      if (event.clientX > rect.left + rect.width / 2) target += 1
    })
    if (target !== state.index) onReorder(state.index, target)
  }

  function handleStripDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    // Only empty strip space adds a tab; a double click on a tab belongs to it.
    if (event.target === event.currentTarget) onAdd()
  }

  return (
    <div className="chrome-tabs">
      <TabGeometryDefs />
      <div
        className="chrome-tabs-content"
        ref={contentRef}
        onDoubleClick={handleStripDoubleClick}
      >
        {tabs.map((tab, index) => {
          const active = tab.id === activeId
          const dragging = drag?.id === tab.id
          return (
            <div
              key={tab.id}
              className={cn('chrome-tab', dragging && 'is-dragging')}
              data-active={active ? '' : undefined}
              data-tab-id={tab.id}
              style={dragging ? { transform: `translateX(${drag.dx}px)` } : undefined}
              onPointerDown={(event) => beginDrag(event, tab, index)}
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
