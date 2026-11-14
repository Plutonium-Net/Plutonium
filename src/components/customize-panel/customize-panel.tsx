import GlassPanel from '@/components/glass-panel/glass-panel'
import './customize-panel.css'

/** The appearance menu. The body is intentionally empty until its options land. */
export default function CustomizePanel({ onClose }: { onClose: () => void }) {
  return (
    <GlassPanel className="customize-panel">
      <div className="customize-panel__head">
        <span className="customize-panel__title">Customize</span>
        <button className="customize-panel__close" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
    </GlassPanel>
  )
}
