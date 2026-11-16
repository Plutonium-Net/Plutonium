import type { ReactNode } from 'react'


const INLINE =
  /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|<https?:\/\/[^>\s]+>|\*[^*\n]+\*|https?:\/\/[^\s<)]+)/g

const BULLET = /^\s*[-*]\s+/
const NUMBERED = /^\s*\d+\.\s+/
const RULE = /^-{3,}$/
const TABLE_ROW = /^\|/
const TABLE_RULE = /^\|[\s:|-]+\|$/

function inline(text: string, key: string, onLink: (href: string) => void): ReactNode[] {
  return text
    .split(INLINE)
    .filter((part) => part !== '')
    .map((part, index) => {
      const id = `${key}-${index}`
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={id}>{part.slice(2, -2)}</strong>
      if (part.startsWith('`') && part.endsWith('`')) return <code key={id}>{part.slice(1, -1)}</code>
      if (part.startsWith('<http') && part.endsWith('>')) {
        const href = part.slice(1, -1)
        return (
          <a key={id} href={href} target="_blank" rel="noreferrer noopener">
            {href}
          </a>
        )
      }
      if (part.startsWith('[')) {
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
        if (link) {
          const href = link[2]
          if (href.startsWith('#')) {
            return (
              <a
                key={id}
                href={href}
                onClick={(event) => {
                  event.preventDefault()
                  onLink(href)
                }}
              >
                {link[1]}
              </a>
            )
          }
          return (
            <a key={id} href={href} target="_blank" rel="noreferrer noopener">
              {link[1]}
            </a>
          )
        }
      }
      if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={id}>{part.slice(1, -1)}</em>
      if (/^https?:\/\//.test(part))
        return (
          <a key={id} href={part} target="_blank" rel="noreferrer noopener">
            {part}
          </a>
        )
      return <span key={id}>{part}</span>
    })
}

function cells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function startsBlock(line: string) {
  return /^#{2,4}\s/.test(line) || /^>\s?/.test(line) || TABLE_ROW.test(line) || BULLET.test(line) || NUMBERED.test(line)
}

function quote(lines: string[], key: string, onLink: (href: string) => void): ReactNode {
  const body: ReactNode[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }
    if (BULLET.test(line)) {
      const items: string[] = []
      while (index < lines.length && BULLET.test(lines[index])) {
        items.push(lines[index].replace(BULLET, ''))
        index += 1
      }
      body.push(
        <ul key={`${key}-ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item, `${key}-li-${index}-${itemIndex}`, onLink)}</li>
          ))}
        </ul>,
      )
      continue
    }
    body.push(<p key={`${key}-p-${index}`}>{inline(line, `${key}-p-${index}`, onLink)}</p>)
    index += 1
  }
  return <blockquote key={key}>{body}</blockquote>
}

function blocks(source: string, onLink: (href: string) => void): ReactNode[] {
  const lines = source.split('\n')
  const out: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim() || RULE.test(line.trim())) {
      index += 1
      continue
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const content = inline(heading[2], `h-${index}`, onLink)
      out.push(
        level === 2 ? (
          <h2 key={`h-${index}`}>{content}</h2>
        ) : level === 3 ? (
          <h3 key={`h-${index}`}>{content}</h3>
        ) : (
          <h4 key={`h-${index}`}>{content}</h4>
        ),
      )
      index += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoted: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^>\s?/, ''))
        index += 1
      }
      out.push(quote(quoted, `quote-${index}`, onLink))
      continue
    }

    if (TABLE_ROW.test(line)) {
      const rows: string[][] = []
      while (index < lines.length && TABLE_ROW.test(lines[index])) {
        if (!TABLE_RULE.test(lines[index].trim())) rows.push(cells(lines[index]))
        index += 1
      }
      const [head, ...rest] = rows
      out.push(
        <div className="legal-doc__table" key={`table-${index}`}>
          <table>
            {head && (
              <thead>
                <tr>
                  {head.map((cell, column) => (
                    <th key={column}>{inline(cell, `th-${index}-${column}`, onLink)}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rest.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, column) => (
                    <td key={column}>{inline(cell, `td-${index}-${rowIndex}-${column}`, onLink)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line)
      const matcher = ordered ? NUMBERED : BULLET
      const items: string[] = []
      while (index < lines.length && matcher.test(lines[index])) {
        items.push(lines[index].replace(matcher, ''))
        index += 1
      }
      const rendered = items.map((item, itemIndex) => (
        <li key={itemIndex}>{inline(item, `li-${index}-${itemIndex}`, onLink)}</li>
      ))
      out.push(ordered ? <ol key={`ol-${index}`}>{rendered}</ol> : <ul key={`ul-${index}`}>{rendered}</ul>)
      continue
    }

    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !startsBlock(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    out.push(<p key={`p-${index}`}>{inline(paragraph.join(' '), `p-${index}`, onLink)}</p>)
  }

  return out
}

export default function LegalDoc({ markdown, onLink }: { markdown: string; onLink: (href: string) => void }) {
  return <div className="legal-doc">{blocks(markdown, onLink)}</div>
}
