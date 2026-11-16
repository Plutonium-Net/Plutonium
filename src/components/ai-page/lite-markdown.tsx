import type { ReactNode } from 'react'

export default function LiteMarkdown({ text }: { text: string }) {
  return <div className="lite-md">{blocks(text)}</div>
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\([^)\s]+\))/g

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE).filter((part) => part !== '')
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={key}>{part.slice(1, -1)}</em>
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">
          {link[1]}
        </a>
      )
    }
    return <span key={key}>{part}</span>
  })
}

function blocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const out: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    const fence = /^```(\w*)\s*$/.exec(line)
    if (fence) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      out.push(
        <pre className="lite-md__pre" key={`code-${index}`}>
          {fence[1] && <span className="lite-md__lang">{fence[1]}</span>}
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const content = inline(heading[2], `h-${index}`)
      out.push(
        level === 1 ? (
          <h3 key={`h-${index}`}>{content}</h3>
        ) : level === 2 ? (
          <h4 key={`h-${index}`}>{content}</h4>
        ) : (
          <h5 key={`h-${index}`}>{content}</h5>
        ),
      )
      index += 1
      continue
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      while (index < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*([-*]|\d+\.)\s+/, ''))
        index += 1
      }
      const rendered = items.map((item, itemIndex) => <li key={`li-${index}-${itemIndex}`}>{inline(item, `li-${index}-${itemIndex}`)}</li>)
      out.push(ordered ? <ol key={`list-${index}`}>{rendered}</ol> : <ul key={`list-${index}`}>{rendered}</ul>)
      continue
    }

    if (!line.trim()) {
      index += 1
      continue
    }

    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s|```|\s*([-*]|\d+\.)\s)/.test(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    out.push(<p key={`p-${index}`}>{inline(paragraph.join(' '), `p-${index}`)}</p>)
  }

  return out
}
