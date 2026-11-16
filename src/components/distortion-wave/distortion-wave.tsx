import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import './distortion-wave.css'

export type WaveOrigin = { x: number; y: number; width: number; height: number }

export type WavePhase = 'cover' | 'reveal'

const PAD = 80

const COVER_MS = 620
const REVEAL_MS = 460

type Props = {
  origin: WaveOrigin
  phase: WavePhase
  onCovered: () => void
  onFinished: () => void
}

export default function DistortionWave({ origin, phase, onCovered, onFinished }: Props) {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const coverMs = reduced ? 1 : COVER_MS
  const revealMs = reduced ? 160 : REVEAL_MS

  const coveredRef = useRef(false)
  const finishedRef = useRef(false)
  const onCoveredRef = useRef(onCovered)
  const onFinishedRef = useRef(onFinished)
  onCoveredRef.current = onCovered
  onFinishedRef.current = onFinished

  const geometry = useMemo(() => {
    const cx = origin.x + origin.width / 2
    const cy = origin.y + origin.height / 2
    const reach =
      Math.max(
        Math.hypot(cx, cy),
        Math.hypot(window.innerWidth - cx, cy),
        Math.hypot(cx, window.innerHeight - cy),
        Math.hypot(window.innerWidth - cx, window.innerHeight - cy),
      ) + PAD
    const size = reach * 2

    return {
      cx,
      cy,
      size,
      scaleX: Math.max(origin.width, 16) / size,
      scaleY: Math.max(origin.height, 16) / size,
    }
  }, [origin])

  function markCovered() {
    if (coveredRef.current) return
    coveredRef.current = true
    onCoveredRef.current()
  }

  function markFinished() {
    if (finishedRef.current) return
    finishedRef.current = true
    onFinishedRef.current()
  }

  useEffect(() => {
    const timer = window.setTimeout(markCovered, coverMs + 180)
    return () => window.clearTimeout(timer)
  }, [coverMs])

  useEffect(() => {
    if (phase !== 'reveal') return undefined
    const timer = window.setTimeout(markFinished, revealMs + 180)
    return () => window.clearTimeout(timer)
  }, [phase, revealMs])

  const vars = {
    '--wave-x': `${geometry.cx}px`,
    '--wave-y': `${geometry.cy}px`,
    '--wave-size': `${geometry.size}px`,
    '--wave-scale-x': `${geometry.scaleX}`,
    '--wave-scale-y': `${geometry.scaleY}`,
    '--wave-cover': `${coverMs}ms`,
    '--wave-reveal': `${revealMs}ms`,
  } as unknown as CSSProperties

  return (
    <div
      className={`distortion-wave${phase === 'reveal' ? ' is-revealing' : ''}`}
      role="presentation"
      aria-hidden="true"
    >
      <div
        className="distortion-wave__shape"
        style={vars}
        onAnimationEnd={markCovered}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'opacity') markFinished()
        }}
      />
    </div>
  )
}
