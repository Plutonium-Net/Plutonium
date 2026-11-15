import { useEffect, useRef } from 'react'
import { useAccent } from '@/hooks/use-accent'
import { paintWave, wavePalette } from './distortion-wave-painter'
import type { WaveOrigin } from './distortion-wave-painter'
import './distortion-wave.css'

export type { WaveOrigin }

export type WavePhase = 'cover' | 'reveal'

/** Long enough to read as a wave, short enough to feel like part of the click. */
const COVER_MS = 620
const REVEAL_MS = 520

type Props = {
  /** The frame the wave opens from, in viewport pixels. */
  origin: WaveOrigin
  phase: WavePhase
  /** Fires once the wave hides the window, so the next screen can be committed. */
  onCovered: () => void
  /** Fires once the wave has dissolved and can be unmounted. */
  onFinished: () => void
}

/**
 * The smart-search transition: an accent wave opens out of the search pill (or
 * the row that was picked), covers the window while the destination is
 * committed underneath, then dissolves onto it.
 *
 * Mounted beside the shell rather than inside the home screen, so it survives
 * the switch from one screen to the other.
 */
export default function DistortionWave({ origin, phase, onCovered, onFinished }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const accent = useAccent()

  const paletteRef = useRef(wavePalette(accent.rgb))
  paletteRef.current = wavePalette(accent.rgb)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const originRef = useRef(origin)
  originRef.current = origin
  const onCoveredRef = useRef(onCovered)
  onCoveredRef.current = onCovered
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  // Timing lives in refs so a re-render (a new accent, a new callback) never
  // restarts the wave; an effect remount keeps the clock it already had.
  const startRef = useRef(0)
  const revealStartRef = useRef(0)
  const coveredRef = useRef(false)
  const finishedRef = useRef(false)

  useEffect(() => {
    const mounted = canvasRef.current
    if (!mounted) return
    const surface = mounted.getContext('2d')
    if (!surface) return
    // Bound with the guard's types, so the animation closures keep them.
    const canvas = mounted
    const ctx = surface

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const coverMs = reduced ? 1 : COVER_MS
    const revealMs = reduced ? 180 : REVEAL_MS
    let width = 0
    let height = 0
    let frame = 0

    function resize() {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener('resize', resize)

    function tick(now: number) {
      if (startRef.current === 0) startRef.current = now
      const elapsed = now - startRef.current
      const cover = reduced ? 1 : Math.min(1, elapsed / coverMs)

      if (phaseRef.current === 'reveal' && revealStartRef.current === 0) revealStartRef.current = now
      const reveal = revealStartRef.current === 0 ? 0 : Math.min(1, (now - revealStartRef.current) / revealMs)

      paintWave(
        ctx,
        width,
        height,
        originRef.current,
        cover,
        reveal,
        elapsed / 1000,
        paletteRef.current,
        reduced,
      )
      if (cover >= 1 && !coveredRef.current) {
        coveredRef.current = true
        onCoveredRef.current()
      }

      if (reveal >= 1) {
        if (!finishedRef.current) {
          finishedRef.current = true
          onFinishedRef.current()
        }
        return
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div
      className={`distortion-wave${phase === 'reveal' ? ' is-revealing' : ''}`}
      role="presentation"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="distortion-wave__canvas" />
    </div>
  )
}
