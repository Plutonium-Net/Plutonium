import GlassPanel from '@/components/glass-panel/glass-panel'
import { usePerformance } from '@/hooks/use-performance'
import { PERFORMANCE_FEATURES, setPerformanceEnabled, setPerformanceFeature } from '@/lib/performance'
import './performance-panel.css'

export default function PerformancePanel({ onClose }: { onClose: () => void }) {
  const { enabled, features } = usePerformance()

  return (
    <GlassPanel className="performance-panel" tint>
      <div className="performance-panel__head">
        <span className="performance-panel__title">Performance Mode</span>
        <button className="performance-panel__close" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <button
        className={`performance-panel__master${enabled ? ' is-on' : ''}`}
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Performance Mode"
        onClick={() => setPerformanceEnabled(!enabled)}
      >
        <span className="performance-panel__master-copy">
          <span className="performance-panel__master-name">Performance Mode</span>
          <span className="performance-panel__master-hint">
            {enabled ? 'Lighter effects are on' : 'Full effects are on'}
          </span>
        </span>
        <span className={`performance-panel__switch performance-panel__switch--master${enabled ? ' is-on' : ''}`} aria-hidden="true">
          <span className="performance-panel__knob" />
        </span>
      </button>

      <div className={`performance-panel__features${enabled ? '' : ' is-locked'}`}>
        <div className="performance-panel__label">Fine tuning</div>
        {PERFORMANCE_FEATURES.map((feature) => {
          const on = features[feature.id]
          return (
            <button
              key={feature.id}
              className={`performance-panel__row${on ? ' is-active' : ''}`}
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={feature.label}
              disabled={!enabled}
              onClick={() => setPerformanceFeature(feature.id, !on)}
            >
              <span className="performance-panel__copy">
                <span className="performance-panel__name">{feature.label}</span>
                <span className="performance-panel__hint">{feature.hint}</span>
              </span>
              <span className={`performance-panel__switch${on ? ' is-on' : ''}`} aria-hidden="true">
                <span className="performance-panel__knob" />
              </span>
            </button>
          )
        })}
      </div>
    </GlassPanel>
  )
}
