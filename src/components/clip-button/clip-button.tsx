import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  captureRectOf,
  getClipAvailability,
  getClipCaptureState,
  registerClipTarget,
  startClipCapture,
  stopClipCapture,
  subscribeClipAvailability,
  subscribeClipCapture,
  type ClipTarget,
} from '@/lib/clips/capture'
import type { ClipSource } from '@/lib/clips/db'
import './clip-button.css'

export function useClipAvailability() {
  return useSyncExternalStore(subscribeClipAvailability, getClipAvailability)
}

function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function useElapsed(startedAt: number) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [startedAt])

  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
}

type ClipButtonProps = {
  target: () => HTMLElement | null
  label: () => string
  source: ClipSource
  variant?: 'bare' | 'pill'
  className?: string
}

export default function ClipButton({ target, label, source, variant = 'pill', className = '' }: ClipButtonProps) {
  const availability = useClipAvailability()
  const state = useSyncExternalStore(subscribeClipCapture, getClipCaptureState)
  const recording = state.status === 'recording'
  const starting = state.status === 'starting'
  const saving = state.status === 'saving'
  const elapsed = useElapsed(recording ? state.startedAt : 0)

  // Props are inline closures, so keep the newest ones in a ref and build the
  // target on demand for both the button and the extension's toolbar icon.
  const latest = useRef({ target, label, source })
  latest.current = { target, label, source }

  const targetRef = useCallback(
    (): ClipTarget => ({
      rect: () => captureRectOf(latest.current.target()),
      label: () => latest.current.label(),
      source: latest.current.source,
    }),
    [],
  )

  useEffect(() => {
    if (availability !== 'ready') return
    return registerClipTarget(targetRef())
  }, [availability, targetRef])

  // No extension means Chrome would have to show its screen picker, so the
  // clip control is not offered at all.
  if (availability !== 'ready') return null

  const title = saving
    ? 'Saving clip…'
    : starting
      ? 'Starting the recorder…'
      : recording
        ? 'Stop recording and save the clip'
        : 'Record a clip'

  return (
    <button
      type="button"
      className={`clip-button clip-button--${variant}${recording ? ' is-rec' : ''}${
        className ? ` ${className}` : ''
      }`}
      onClick={() => {
        if (recording) void stopClipCapture()
        else if (!starting && !saving) void startClipCapture(targetRef())
      }}
      disabled={starting || saving}
      aria-label={recording ? 'Stop recording and save the clip' : 'Record a clip'}
      aria-pressed={recording}
      title={title}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="clip-button__icon">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
      </svg>
      {variant === 'pill' ? (
        <span className="clip-button__text">
          <span className="clip-button__dot" aria-hidden="true" />
          {saving ? 'Saving…' : recording ? `Stop ${clock(elapsed)}` : 'Clip'}
        </span>
      ) : recording ? (
        <span className="clip-button__time">{clock(elapsed)}</span>
      ) : null}
    </button>
  )
}
