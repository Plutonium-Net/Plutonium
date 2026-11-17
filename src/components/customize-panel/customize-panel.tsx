import { selectBackground, subscribeBackground, getBackgroundChoice } from '@/components/backgrounds/background-store'
import { BACKGROUNDS } from '@/components/backgrounds/registry'
import GlassHighlight from '@/components/glass-highlight/glass-highlight'
import GlassPanel from '@/components/glass-panel/glass-panel'
import { useAccent } from '@/hooks/use-accent'
import { ACCENTS, selectAccent } from '@/lib/accent'
import { useSyncExternalStore, type CSSProperties } from 'react'
import './customize-panel.css'

export default function CustomizePanel({ onClose }: { onClose: () => void }) {
  const choice = useSyncExternalStore(subscribeBackground, getBackgroundChoice, getBackgroundChoice)
  const accent = useAccent()

  return (
    <GlassPanel className="customize-panel" tint>
      <div className="customize-panel__head">
        <span className="customize-panel__title">Customize</span>
        <button className="customize-panel__close" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="customize-panel__label">Accent</div>
      <div className="customize-panel__swatches">
        {ACCENTS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`customize-panel__swatch${option.id === accent.id ? ' is-active' : ''}`}
            style={{ '--swatch': option.hex } as CSSProperties}
            aria-label={option.name}
            aria-pressed={option.id === accent.id}
            title={option.name}
            onClick={() => selectAccent(option.id)}
          />
        ))}
      </div>

      <div className="customize-panel__label">Background</div>
      <div className="customize-panel__list">
        {BACKGROUNDS.map((option) => {
          const active = option.id === choice
          return (
            <button
              key={option.id}
              type="button"
              className={`customize-panel__row${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => selectBackground(option.id)}
            >
              {active && <GlassHighlight />}
              <span className="customize-panel__name">{option.name}</span>
            </button>
          )
        })}
      </div>
    </GlassPanel>
  )
}
