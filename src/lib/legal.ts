import source from './legal.md?raw'

export type LegalSection = 'terms' | 'privacy'

export type LegalDoc = {
  id: LegalSection
  title: string
  markdown: string
}

const text = source.replace(/\r\n/g, '\n')

function section(heading: string, until: string | null) {
  const start = text.indexOf(heading)
  if (start < 0) return ''
  const body = start + heading.length
  const end = until ? text.indexOf(until, body) : -1
  return text.slice(body, end < 0 ? undefined : end).trim()
}

export const LEGAL_DOCS: LegalDoc[] = [
  { id: 'terms', title: 'Terms of Service', markdown: section('## Terms of Service', '## Privacy Policy') },
  { id: 'privacy', title: 'Privacy Policy', markdown: section('## Privacy Policy', null) },
]

export function legalDoc(section: LegalSection): LegalDoc {
  return LEGAL_DOCS.find((doc) => doc.id === section) ?? LEGAL_DOCS[0]
}
