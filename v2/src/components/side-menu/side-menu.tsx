import type { ReactNode } from 'react'
import './side-menu.css'

type PanelId = 'history' | 'info' | 'proxy' | 'region'

type MenuItem = {
  id: string
  label: string
  panel?: PanelId
  icon: ReactNode
}

const ITEMS: MenuItem[] = [
  {
    id: 'history',
    label: 'History',
    panel: 'history',
    icon: (
      <>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M12 7v5l4 2" />
      </>
    ),
  },
  {
    id: 'wisp',
    label: 'Wisp region',
    panel: 'region',
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
      </>
    ),
  },
  {
    id: 'proxy',
    label: 'pr0xy switcher',
    panel: 'proxy',
    icon: (
      <>
        <rect width="20" height="8" x="2" y="2" rx="2" />
        <rect width="20" height="8" x="2" y="14" rx="2" />
        <path d="M6 6h.01" />
        <path d="M6 18h.01" />
      </>
    ),
  },
  {
    id: 'info',
    label: 'Info',
    panel: 'info',
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </>
    ),
  },
]

type SideMenuProps = {
  activePanel: PanelId | null
  onTogglePanel: (panel: PanelId) => void
}

export default function SideMenu({ activePanel, onTogglePanel }: SideMenuProps) {
  return (
    <nav className="side-menu" aria-label="Home menu">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          className={`side-menu__btn${item.panel && item.panel === activePanel ? ' is-open' : ''}`}
          type="button"
          aria-label={item.label}
          title={item.label}
          aria-pressed={item.panel ? item.panel === activePanel : undefined}
          onClick={item.panel ? () => onTogglePanel(item.panel!) : undefined}
        >
          <svg
            className="side-menu__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {item.icon}
          </svg>
        </button>
      ))}
    </nav>
  )
}
