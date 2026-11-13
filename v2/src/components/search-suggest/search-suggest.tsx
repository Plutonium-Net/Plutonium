import type { SmartGroup, SmartRow } from '@/lib/search/smart-search'
import './search-suggest.css'

type Props = {
  groups: SmartGroup[]
  activeIndex: number
  entering: boolean
  onHover: (index: number) => void
  onPick: (row: SmartRow) => void
}

/**
 * v1's search dropdown, minus the panel: the rows sit straight on the background
 * and drop in one after another, so the list reads as text fading down rather
 * than a box appearing.
 */
export default function SearchSuggest({ groups, activeIndex, entering, onHover, onPick }: Props) {
  let index = -1

  return (
    <div className={`search-suggest${entering ? ' is-entering' : ''}`} role="listbox" aria-label="Search suggestions">
      {groups.map((group, groupIndex) => (
        <div className="search-suggest__group" key={`${group.title}-${groupIndex}`} role="group">
          {group.title ? (
            <div className="search-suggest__header" style={{ animationDelay: `${Math.max(index, 0) * 22}ms` }}>
              {group.title}
            </div>
          ) : null}
          {group.rows.map((row) => {
            index += 1
            const at = index
            return (
              <button
                key={row.id}
                type="button"
                role="option"
                aria-selected={at === activeIndex}
                className={`search-suggest__row${at === activeIndex ? ' is-active' : ''}`}
                style={{ animationDelay: `${at * 22}ms` }}
                // Keeps the caret in the input, so the bar never blurs mid-pick.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => onHover(at)}
                onClick={() => onPick(row)}
              >
                <RowIcon kind={row.icon} />
                <span className="search-suggest__copy">
                  <span className="search-suggest__label">{row.label}</span>
                  {row.sub ? <span className="search-suggest__sub">{row.sub}</span> : null}
                </span>
                <svg className="search-suggest__enter" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h13" />
                  <path d="m12.5 5.5 6.5 6.5-6.5 6.5" />
                </svg>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const ICONS: Record<string, string[]> = {
  search: ['M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z', 'm16 16 4.5 4.5'],
  trend: ['m3.5 16.5 6-6 4 4 7-7', 'M14 7.5h6.5V14'],
  clock: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z', 'M12 7.5v5l3 2'],
  app: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  // Slash commands read as terminal lines rather than a literal "/".
  command: ['M4.5 5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'm7.5 10 2 2-2 2', 'M12.8 14h3.7'],
}

function RowIcon({ kind }: { kind: string }) {
  return (
    <svg className="search-suggest__icon" viewBox="0 0 24 24" aria-hidden="true">
      {(ICONS[kind] || ICONS.search).map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  )
}
