import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { usePins } from '@/hooks/use-pins'
import { loadPins } from '@/lib/pins'
import './pins.css'

// A wide, shallow curve: neighbouring tiles share most of the growth, so the row
// swells as one instead of one tile popping up.
const MAGNIFY = 0.34
const FALLOFF = 132
const SPREAD = 0.42
const LIFT = 6

/** v1's shortcut tiles, lined up along the bottom of the home page. */
export default function Pins({ onOpen }: { onOpen: (href: string) => void }) {
  const pins = usePins()
  const rowRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => {
    void loadPins()
  }, [])

  /**
   * Dock magnification: every tile grows by a gaussian of its distance from the
   * cursor and slides away from it, so the row swells around the pointer instead
   * of one tile simply popping. Written straight to CSS variables to keep it off
   * the render path.
   */
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const row = rowRef.current
    if (!row) return
    const rowRect = row.getBoundingClientRect()
    const pointerX = event.clientX - rowRect.left
    const pointerY = event.clientY - rowRect.top
    let nearest = 0
    let nearestDistance = Number.POSITIVE_INFINITY

    tileRefs.current.forEach((tile, index) => {
      if (!tile) return
      const centerX = tile.offsetLeft + tile.offsetWidth / 2
      const centerY = tile.offsetTop + tile.offsetHeight / 2
      const across = pointerX - centerX
      // The row wraps on narrow screens, so tiles on the other line stay small.
      const down = pointerY - centerY
      const weight = Math.exp(-((across / FALLOFF) ** 2)) * Math.exp(-((down / (FALLOFF * 0.8)) ** 2))
      const scale = 1 + MAGNIFY * weight
      const shift = -Math.sign(across) * (scale - 1) * tile.offsetWidth * SPREAD
      const lift = -weight * LIFT

      tile.style.setProperty('--pin-scale', scale.toFixed(3))
      tile.style.setProperty('--pin-shift', `${shift.toFixed(1)}px`)
      tile.style.setProperty('--pin-lift', `${lift.toFixed(1)}px`)
      // How far the tile's top edge rose, so its name can ride up with it.
      tile.style.setProperty('--pin-grow', `${((scale - 1) * tile.offsetHeight).toFixed(1)}px`)

      const distance = Math.hypot(across, down)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = index
      }
    })

    setHovered(nearest)
  }

  function resetRow() {
    tileRefs.current.forEach((tile) => {
      if (!tile) return
      tile.style.removeProperty('--pin-scale')
      tile.style.removeProperty('--pin-shift')
      tile.style.removeProperty('--pin-lift')
      tile.style.removeProperty('--pin-grow')
    })
    setHovered(null)
  }

  if (!pins.length) return null

  return (
    <div
      ref={rowRef}
      className={`pins${hovered === null ? '' : ' is-tracking'}`}
      role="list"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetRow}
      onPointerCancel={resetRow}
      onPointerOut={(event) => {
        // Leaving the row (not just one tile) settles the whole dock back down.
        const next = event.relatedTarget as Node | null
        if (!next || !event.currentTarget.contains(next)) resetRow()
      }}
    >
      {pins.map((pin, index) => (
        <button
          key={pin.id}
          ref={(element) => {
            tileRefs.current[index] = element
          }}
          type="button"
          role="listitem"
          className={`pins__pin${hovered === index ? ' is-hovered' : ''}`}
          title={pin.name}
          onClick={() => onOpen(pin.href)}
        >
          <span className="pins__title">{pin.name}</span>
          <span className="pins__tile">
            <PinThumb src={pin.image} />
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * The proxy service worker answers requests at scope `/`, and it drops
 * cross-origin image loads. Fetching the thumbnail and handing the tile a blob
 * URL sidesteps that, and the glyph shows until the bytes arrive.
 */
function PinThumb({ src }: { src?: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!src) return
    let alive = true
    let objectUrl: string | null = null

    fetch(src)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!alive || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        /* the glyph stays */
      })

    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  if (!url) {
    return (
      <svg className="pins__glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h7v7H4z" />
        <path d="M13 5h7v7h-7z" />
        <path d="M4 14h7v7H4z" />
        <path d="M13 14h7v7h-7z" />
      </svg>
    )
  }

  return <img className="pins__thumb" src={url} alt="" draggable={false} />
}
