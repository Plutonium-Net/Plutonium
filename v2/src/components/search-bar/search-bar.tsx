import { useState } from 'react'
import type { FormEvent } from 'react'
import { BorderBeam } from 'border-beam'
import FoldText from '@/components/fold-text/FoldText'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import './search-bar.css'

export default function SearchBar({ onNavigate }: { onNavigate: (input: string) => boolean }) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = value.trim()
    // Only `pluto://` pages resolve today; anything else stays in the box because
    // there is no page frame or proxy engine to send it to yet.
    if (query && onNavigate(query)) setValue('')
  }

  return (
    <div className="search-bar">
      <div className="search-bar-wordmark">
        {/* Scales with the pill: the bar is min(560px, 90vw), so this keeps the
            wordmark at ~91% of its width on any screen. */}
        <FoldText text="Plutonium" fontSize="min(98px, 15.7vw)" fontWeight={400} />
      </div>
      {/* Always wrapped: swapping the wrapper in and out on focus would remount
          the input and drop the caret on the first click. */}
      <BorderBeam
        className="search-bar-beam"
        size="md"
        colorVariant="colorful"
        strength={0.7}
        theme="dark"
        borderRadius={999}
        active={focused}
      >
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
              className="search-bar-input"
              type="text"
              name="plu-newtab-query"
              aria-label="Search"
              placeholder="Search the web, enter a url, or use / commands."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          </form>
        </GlassSurface>
      </BorderBeam>
    </div>
  )
}
