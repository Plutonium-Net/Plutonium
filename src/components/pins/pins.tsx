import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { usePins } from '@/hooks/use-pins'
import { loadPins, unpin } from '@/lib/pins'
import './pins.css'

const MAGNIFY = 0.3
const FALLOFF = 118
const SPREAD = 0.38
const ARC = 0.4
const TAU = 0.075
const SETTLED = 0.0015

type Pose = { scale: number; shift: number; lift: number }
const REST: Pose = { scale: 1, shift: 0, lift: 0 }

export default function Pins({
  onOpen,
  minimized = false,
}: {
  onOpen: (href: string) => void
  minimized?: boolean
}) {
  const pins = usePins()
  const rowRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<Array<HTMLDivElement | null>>([])
  const targetsRef = useRef<Pose[]>([])
  const posesRef = useRef<Pose[]>([])
  const frameRef = useRef<number | null>(null)
  const lastRef = useRef(0)
  const hoveredRef = useRef<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => {
    void loadPins()
  }, [])

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  const step = useCallback((now: number) => {
    const elapsed = lastRef.current ? Math.min((now - lastRef.current) / 1000, 0.05) : 1 / 60
    lastRef.current = now
    const ease = 1 - Math.exp(-elapsed / TAU)
    let moving = false

    tileRefs.current.forEach((tile, index) => {
      if (!tile) return
      const target = targetsRef.current[index] ?? REST
      const pose = posesRef.current[index] ?? { ...REST }

      pose.scale += (target.scale - pose.scale) * ease
      pose.shift += (target.shift - pose.shift) * ease
      pose.lift += (target.lift - pose.lift) * ease

      const close =
        Math.abs(target.scale - pose.scale) < SETTLED &&
        Math.abs(target.shift - pose.shift) < SETTLED * 100 &&
        Math.abs(target.lift - pose.lift) < SETTLED * 100

      if (close) {
        pose.scale = target.scale
        pose.shift = target.shift
        pose.lift = target.lift
      } else {
        moving = true
      }

      posesRef.current[index] = pose
      tile.style.setProperty('--pin-scale', pose.scale.toFixed(4))
      tile.style.setProperty('--pin-shift', `${pose.shift.toFixed(2)}px`)
      tile.style.setProperty('--pin-lift', `${pose.lift.toFixed(2)}px`)
      const grownX = (pose.scale - 1) * (tile.offsetWidth / 2)
      const grownY = (pose.scale - 1) * tile.offsetHeight
      tile.style.setProperty('--pin-grow', `${grownY.toFixed(2)}px`)
      tile.style.setProperty('--pin-x', `${(pose.shift + grownX).toFixed(2)}px`)
      tile.style.setProperty('--pin-y', `${(pose.lift - grownY).toFixed(2)}px`)
    })

    frameRef.current = moving ? requestAnimationFrame(step) : null
    if (!moving) lastRef.current = 0
  }, [])

  const ensureFrame = useCallback(() => {
    if (frameRef.current !== null) return
    lastRef.current = 0
    frameRef.current = requestAnimationFrame(step)
  }, [step])

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
      const down = pointerY - centerY
      const weight = Math.exp(-((across / FALLOFF) ** 2)) * Math.exp(-((down / (FALLOFF * 0.8)) ** 2))
      const scale = 1 + MAGNIFY * weight
      const rise = (scale - 1) * tile.offsetHeight * ARC

      targetsRef.current[index] = {
        scale,
        shift: -Math.sign(across) * rise * SPREAD,
        lift: -rise,
      }

      const distance = Math.hypot(across, down)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = index
      }
    })

    ensureFrame()
    if (hoveredRef.current !== nearest) {
      hoveredRef.current = nearest
      setHovered(nearest)
    }
  }

  function resetRow() {
    tileRefs.current.forEach((_tile, index) => {
      targetsRef.current[index] = REST
    })
    hoveredRef.current = null
    setHovered(null)
    ensureFrame()
  }

  if (!pins.length) return null

  return (
    <div
      ref={rowRef}
      className={`pins${minimized ? ' is-minimized' : ''}`}
      role="list"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetRow}
      onPointerCancel={resetRow}
      onPointerOut={(event) => {
        const next = event.relatedTarget as Node | null
        if (!next || !event.currentTarget.contains(next)) resetRow()
      }}
    >
      {pins.map((pin, index) => (
        <div
          key={pin.id}
          ref={(element) => {
            tileRefs.current[index] = element
          }}
          className={`pins__pin${hovered === index ? ' is-hovered' : ''}`}
          role="listitem"
        >
          <button type="button" className="pins__open" title={pin.name} onClick={() => onOpen(pin.href)}>
            <span className="pins__title">{pin.name}</span>
            <span className="pins__tile">
              <PinThumb src={pin.image} />
            </span>
          </button>
          <button
            type="button"
            className="pins__unpin"
            aria-label={`Unpin ${pin.name}`}
            title={`Unpin ${pin.name}`}
            onClick={() => unpin(pin.id)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7 7 10 10" />
              <path d="M17 7 7 17" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

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
