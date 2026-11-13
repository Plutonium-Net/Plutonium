import { useState } from 'react'
import type { FormEvent } from 'react'
import { BorderBeam } from 'border-beam'
import FoldText from '@/components/fold-text/FoldText'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import { BEAM_PROPS } from '@/lib/beam'
import './search-bar.css'

export default function SearchBar({ onNavigate }: { onNavigate: (input: string) => boolean | Promise<boolean> }) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = value.trim()
    if (!query) return
    // Clears only when the navigation was accepted, so a failed remote session
    // leaves the query in place to retry.
    if (await onNavigate(query)) setValue('')
  }

  return (
    <div className="search-bar">
      <div className="search-bar-wordmark">
        {/* Scales with the pill: the bar is min(560px, 90vw), so this keeps the
            wordmark at ~80% of its width on any screen.
            trigger="mount" rather than "scroll": the wordmark is fixed in view,
            so a ScrollTrigger would fire on the first refresh or never. */}
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
      {/* Always wrapped: swapping the wrapper in and out on focus would remount
          the input and drop the caret on the first click. */}
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
