import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { BorderBeam } from 'border-beam'
import FoldText from '@/components/fold-text/FoldText'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import SearchSuggest from '@/components/search-suggest/search-suggest'
import { useHistory } from '@/hooks/use-history'
import { BEAM_PROPS } from '@/lib/beam'
import { buildGroups, fetchSuggestions, suggestionRows } from '@/lib/search/smart-search'
import type { SmartGroup, SmartRow } from '@/lib/search/smart-search'
import './search-bar.css'

export default function SearchBar({
  onNavigate,
  onActiveChange,
}: {
  onNavigate: (input: string, origin?: DOMRect) => boolean | Promise<boolean>
  onActiveChange?: (active: boolean) => void
}) {
  const history = useHistory()
  const barRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [suggestions, setSuggestions] = useState<string[]>([])

  const groups = useMemo<SmartGroup[]>(() => {
    const base = buildGroups(value, history)
    const rows = suggestionRows(value, suggestions)
    if (!rows.length) return base
    const next = [...base]
    const after = next.findIndex((group) => group.title === 'Apps')
    next.splice(after === -1 ? 0 : after + 1, 0, { title: 'Suggestions', rows })
    return next
  }, [value, history, suggestions])

  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups])

  useEffect(() => {
    const query = value.trim()
    if (!open || !query || query.startsWith('/')) {
      setSuggestions([])
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetchSuggestions(query, controller.signal).then((list) => {
        if (!controller.signal.aborted) setSuggestions(list)
      })
    }, 120)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [value, open])

  useEffect(() => {
    setActive(value.trim() && rows.length ? rows.length - 1 : 0)
  }, [rows, value])

  function openList() {
    setOpen(true)
    setFocused(true)
    onActiveChange?.(true)
  }

  function closeList() {
    setOpen(false)
  }

  function pillRect() {
    const pill = barRef.current?.querySelector('.search-bar-beam') ?? barRef.current
    return pill?.getBoundingClientRect()
  }

  async function pick(row: SmartRow, source?: HTMLElement) {
    if (row.complete !== undefined) {
      setValue(row.complete)
      inputRef.current?.focus()
      return
    }
    if (!row.navigate) return
    const origin = source?.getBoundingClientRect() ?? pillRect()
    closeList()
    if (await onNavigate(row.navigate, origin)) setValue('')
  }

  function move(step: number) {
    if (!rows.length) return
    setActive((index) => (index + step + rows.length) % rows.length)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      closeList()
      return
    }
    if (!open || !rows.length) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const row = rows[active]
      if (row) void pick(row)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = value.trim()
    if (!query) return
    if (await onNavigate(query, pillRect())) setValue('')
  }

  return (
    <div className="search-bar" ref={barRef}>
      <div className="search-bar-wordmark">
        <FoldText
          text="Plutonium"
          foldStyle="paper"
          splitBy="char"
          hinge="top"
          trigger="mount"
          foldAngle={92}
          duration={0.65}
          stagger={0.045}
          staggerFrom="center"
          ease="power3.out"
          hoverRefold
          refoldRadius={140}
          refoldAngle={45}
          perspective={700}
          creaseShading={0.55}
          fontSize="min(88px, 14.1vw)"
          fontWeight={400}
        />
      </div>
      <BorderBeam className="search-bar-beam" {...BEAM_PROPS} borderRadius={999} active={focused}>
        <GlassSurface
          className="search-bar-glass"
          width="100%"
          height="100%"
          borderRadius={999}
          backgroundOpacity={0.1}
          saturation={1.2}
          displace={0.5}
        >
          <form className="search-bar-inner" onSubmit={handleSubmit}>
            <svg className="search-bar-icon" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <line
                x1="13.4"
                y1="13.4"
                x2="17.5"
                y2="17.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <input
              ref={inputRef}
              className="search-bar-input"
              type="text"
              name="plu-newtab-query"
              aria-label="Search"
              placeholder="Search the web, enter a url, or use / commands."
              aria-autocomplete="list"
              aria-expanded={open}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setOpen(true)
              }}
              onFocus={openList}
              onBlur={() => {
                setFocused(false)
                onActiveChange?.(false)
                closeList()
              }}
              onKeyDown={handleKeyDown}
            />
          </form>
        </GlassSurface>
      </BorderBeam>

      {open && rows.length > 0 && (
        <SearchSuggest
          groups={groups}
          activeIndex={active}
          onHover={setActive}
          onPick={(row, source) => void pick(row, source)}
        />
      )}
    </div>
  )
}
