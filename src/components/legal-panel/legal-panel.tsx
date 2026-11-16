import Modal from '@/components/modal/modal'
import PillGlass from '@/components/glass-pill/pill-glass'
import LegalDoc from '@/components/legal-panel/legal-doc'
import { LEGAL_DOCS, legalDoc, type LegalSection } from '@/lib/legal'
import './legal-panel.css'

const DISCORD = 'https://discord.gg/R3dJ7hpUXX'

export default function LegalPanel({
  section,
  onSectionChange,
  onClose,
}: {
  section: LegalSection
  onSectionChange: (section: LegalSection) => void
  onClose: () => void
}) {
  const doc = legalDoc(section)

  return (
    <Modal className="legal-panel" label="Terms of Service and Privacy Policy" onClose={onClose}>
      <div className="legal-panel__head">
        <span className="legal-panel__title">Legal</span>
        <div className="legal-panel__tabs">
          {LEGAL_DOCS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`legal-panel__tab${entry.id === section ? ' is-active' : ''}`}
              aria-pressed={entry.id === section}
              onClick={() => onSectionChange(entry.id)}
            >
              <PillGlass />
              {entry.title}
            </button>
          ))}
        </div>
        <button className="legal-panel__close" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="legal-panel__scroll">
        <LegalDoc markdown={doc.markdown} onLink={(href) => onSectionChange(href === '#terms' ? 'terms' : 'privacy')} />
        <div className="legal-panel__foot">
          <span>© Plutonium Network 2026</span>
          <a href={DISCORD} target="_blank" rel="noopener noreferrer">
            Contact us on Discord
          </a>
        </div>
      </div>
    </Modal>
  )
}
