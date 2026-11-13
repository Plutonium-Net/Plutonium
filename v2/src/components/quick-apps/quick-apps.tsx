import type { ReactNode } from 'react'
import './quick-apps.css'

type AppItem = { id: string; label: string; href: string; icon: ReactNode }

/** Same icon language as the side menu: 24-box, stroked, no fills. */
const ITEMS: AppItem[] = [
  {
    id: 'games',
    label: 'Games',
    href: 'pluto://games',
    icon: (
      <>
        <line x1="6" x2="10" y1="11" y2="11" />
        <line x1="8" x2="8" y1="9" y2="13" />
        <line x1="15" x2="15.01" y1="12" y2="12" />
        <line x1="18" x2="18.01" y1="10" y2="10" />
        <path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59c-.01.05-.01.1-.02.15C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.42.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.54-.6-6.58-.68-7.26a4 4 0 0 0-4-3.74Z" />
      </>
    ),
  },
  {
    id: 'ai',
    label: 'AI',
    href: 'pluto://ai',
    icon: (
      <>
        <path d="M12 3 10.1 8.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
        <path d="M5 3v4" />
        <path d="M19 17v4" />
        <path d="M3 5h4" />
        <path d="M17 19h4" />
      </>
    ),
  },
  {
    id: 'media',
    label: 'Media',
    href: 'pluto://media',
    icon: (
      <>
        <circle cx="12" cy="12" r="9.5" />
        <path d="M10 8.4 16 12l-6 3.6Z" />
      </>
    ),
  },
  {
    id: 'vms',
    label: 'VMs',
    href: 'pluto://vms',
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
    id: 'apps',
    label: 'Apps',
    href: 'pluto://apps',
    icon: (
      <>
        <rect width="7" height="7" x="3" y="3" rx="1.4" />
        <rect width="7" height="7" x="14" y="3" rx="1.4" />
        <rect width="7" height="7" x="14" y="14" rx="1.4" />
        <rect width="7" height="7" x="3" y="14" rx="1.4" />
      </>
    ),
  },
]

export default function QuickApps({ onOpen }: { onOpen: (href: string) => void }) {
  return (
    <nav className="quick-apps" aria-label="Pages">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className="quick-apps__btn"
          aria-label={item.label}
          title={item.label}
          onClick={() => onOpen(item.href)}
        >
          <svg
            className="quick-apps__icon"
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
