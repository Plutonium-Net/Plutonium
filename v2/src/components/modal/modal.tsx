import type { PointerEvent, ReactNode } from 'react'
import GlassPanel from '@/components/glass-panel/glass-panel'
import './modal.css'

/**
 * A centred dialog on the same GlassPanel the side panels use, so a modal is
 * real refracted glass rather than a flat dark card. Escape is handled by the
 * app shell, which knows which surface is on top; here a press on the scrim
 * closes, and a press inside the glass does not.
 */
export default function Modal({
  className = '',
  label,
  onClose,
  children,
}: {
  className?: string
  label: string
  onClose: () => void
  children: ReactNode
}) {
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div className="glass-modal" role="presentation" onPointerDown={onPointerDown}>
      <GlassPanel className={`glass-modal__panel${className ? ` ${className}` : ''}`}>
        <div className="glass-modal__inner" role="dialog" aria-modal="true" aria-label={label}>
          {children}
        </div>
      </GlassPanel>
    </div>
  )
}
