import { selectBackground, subscribeBackground, getBackgroundChoice } from '@/components/backgrounds/background-store'
import { BACKGROUNDS } from '@/components/backgrounds/registry'
import GlassHighlight from '@/components/glass-highlight/glass-highlight'
import GlassPanel from '@/components/glass-panel/glass-panel'
import { useAccent } from '@/hooks/use-accent'
import { useSeasonal } from '@/hooks/use-season'
import { ACCENTS, selectAccent } from '@/lib/accent'
import { seasonFor, setSeasonal } from '@/lib/season'
import { useSyncExternalStore, type CSSProperties } from 'react'
import './customize-panel.css'

export default function CustomizePanel({ onClose }: { onClose: () => void }) {
  const choice = useSyncExternalStore(subscribeBackground, getBackgroundChoice, getBackgroundChoice)
  const accent = useAccent()
  const seasonal = useSeasonal()
  const preset = seasonal ? seasonFor() : null
  const locked = preset !== null
  const hint = locked ? preset.name : seasonal ? 'No preset this month' : 'Custom'

  return (
    <GlassPanel className="customize-panel" tint>
      <div className="customize-panel__head">
        <span className="customize-panel__title">Customize</span>
        <button className="customize-panel__close" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={seasonal}
        aria-label="Seasonal themes"
        className={`customize-panel__row customize-panel__switch-row${seasonal ? ' is-active' : ''}`}
        onClick={() => setSeasonal(!seasonal)}
      >
        {seasonal && <GlassHighlight />}
        <span className="customize-panel__name">Seasonal</span>
        <span className="customize-panel__hint">{hint}</span>
        <span className={`customize-panel__switch${seasonal ? ' is-on' : ''}`} aria-hidden="true">
          <span className="customize-panel__knob" />
        </span>
      </button>

      <div className={`customize-panel__group${locked ? ' is-locked' : ''}`}>
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
              disabled={locked}
              onClick={() => selectAccent(option.id)}
            />
          ))}
        </div>
      </div>

      <div className={`customize-panel__group${locked ? ' is-locked' : ''}`}>
        <div className="customize-panel__label">Background</div>
        <div className="customize-panel__previews">
          {BACKGROUNDS.map((option) => {
            const active = option.id === choice
            const Preview = option.Preview
            return (
              <button
                key={option.id}
                type="button"
                className={`customize-panel__preview${active ? ' is-active' : ''}`}
                style={option.preview ? { backgroundImage: option.preview } : undefined}
                aria-label={option.name}
                aria-pressed={active}
                title={option.name}
                disabled={locked}
                onClick={() => selectBackground(option.id)}
              >
                {Preview && <Preview />}
                <span className="customize-panel__preview-name">{option.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </GlassPanel>
  )
}
