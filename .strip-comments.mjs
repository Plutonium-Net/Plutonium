import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DRY = process.argv.includes('--dry')

const JS_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.mts', '.cts'])
const ROOT_FILES = [
  'index.html',
  'download.html',
  'vite.config.js',
  'vite.config.single.js',
  'vite.config.download.js',
  'api/wrangler.toml',
]
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.freebuff',
  '.preview',
  'dist',
  'dist-single',
  'dist-download',
  'dist-download-page',
  'bridge',
  'core',
  'mesh',
  'runtime',
  'runtimev2',
])

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(path.join(dir, entry.name), out)
    } else {
      out.push(path.join(dir, entry.name))
    }
  }
  return out
}

const isIdentStart = (c) => /[A-Za-z_$]/.test(c)
const isIdent = (c) => /[A-Za-z0-9_$]/.test(c)

const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'case', 'do', 'else', 'yield', 'await', 'throw',
])
const REGEX_PUNCT = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', ';', '{', '}', '+', '-',
  '*', '%', '~', '^', '<', '>', '=>',
])

function regexAllowed(last) {
  if (last === null) return true
  if (last.type === 'word') return last.keyword && REGEX_KEYWORDS.has(last.text)
  if (last.type === 'punct') return REGEX_PUNCT.has(last.text)
  return false
}

// If src[i] is '{' and the whole container holds nothing but whitespace and
// comments, returns the index just past its closing '}', else -1. Lets a JSX
// comment like {/* note */} be removed with its braces instead of as '{}'.
function commentOnlyContainerEnd(src, i) {
  const n = src.length
  let j = i + 1
  while (j < n) {
    const c = src[j]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { j++; continue }
    if (c === '/' && src[j + 1] === '/') {
      while (j < n && src[j] !== '\n') j++
      continue
    }
    if (c === '/' && src[j + 1] === '*') {
      const close = src.indexOf('*/', j + 2)
      if (close === -1) return -1
      j = close + 2
      continue
    }
    if (c === '}') return j + 1
    return -1
  }
  return -1
}

// Removes // and /* */ comment ranges from JS/TS (optionally JSX).
function stripJs(src, jsx) {
  const del = []
  const n = src.length
  let i = 0
  let last = null
  const stack = [{ kind: 'code', brace: 0, endOnBrace: false }]

  const top = () => stack[stack.length - 1]

  while (i < n) {
    const f = top()
    const c = src[i]

    if (f.kind === 'code') {
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') { i++; continue }

      if (c === '/' && src[i + 1] === '/') {
        let j = i + 2
        while (j < n && src[j] !== '\n' && src[j] !== '\r') j++
        del.push([i, j])
        i = j
        continue
      }

      if (c === '/' && src[i + 1] === '*') {
        const close = src.indexOf('*/', i + 2)
        const j = close === -1 ? n : close + 2
        del.push([i, j])
        i = j
        continue
      }

      if (c === "'" || c === '"') { stack.push({ kind: 'string', quote: c }); i++; continue }
      if (c === '`') { stack.push({ kind: 'template' }); i++; continue }

      if (c === '/' && regexAllowed(last)) { stack.push({ kind: 'regex' }); i++; continue }

      if (jsx && c === '<' && regexAllowed(last)) {
        const next = src[i + 1]
        if (next === '>' || next === '/' || (next && isIdentStart(next))) {
          stack.push({ kind: 'jsxTag' })
          i++
          continue
        }
      }

      if (c === '{') { f.brace++; last = { type: 'punct', text: '{' }; i++; continue }
      if (c === '}') {
        if (f.endOnBrace && f.brace === 0) { stack.pop(); i++; continue }
        f.brace--
        last = { type: 'punct', text: '}' }
        i++
        continue
      }

      if (isIdentStart(c)) {
        let j = i + 1
        while (j < n && isIdent(src[j])) j++
        const text = src.slice(i, j)
        last = { type: 'word', text, keyword: REGEX_KEYWORDS.has(text) }
        i = j
        continue
      }

      if (/[0-9]/.test(c)) {
        let j = i + 1
        while (j < n && /[0-9a-zA-Z._]/.test(src[j])) j++
        last = { type: 'number' }
        i = j
        continue
      }

      // multi-char punctuation we care about
      if (c === '=' && src[i + 1] === '>') { last = { type: 'punct', text: '=>' }; i += 2; continue }

      last = { type: 'punct', text: c }
      i++
      continue
    }

    if (f.kind === 'string') {
      if (c === '\\') { i += 2; continue }
      if (c === f.quote) { stack.pop(); last = { type: 'value' }; i++; continue }
      i++
      continue
    }

    if (f.kind === 'template') {
      if (c === '\\') { i += 2; continue }
      if (c === '`') { stack.pop(); last = { type: 'value' }; i++; continue }
      if (c === '$' && src[i + 1] === '{') {
        stack.push({ kind: 'code', brace: 0, endOnBrace: true })
        last = { type: 'punct', text: '{' }
        i += 2
        continue
      }
      i++
      continue
    }

    if (f.kind === 'regex') {
      if (c === '\\') { i += 2; continue }
      if (c === '[') {
        i++
        while (i < n && src[i] !== ']') {
          if (src[i] === '\\') i += 2
          else i++
        }
        i++
        continue
      }
      if (c === '/') {
        i++
        while (i < n && /[a-z]/i.test(src[i])) i++
        stack.pop()
        last = { type: 'value' }
        continue
      }
      i++
      continue
    }

    if (f.kind === 'jsxTag') {
      if (c === '/' && src[i + 1] === '/') {
        let j = i + 2
        while (j < n && src[j] !== '\n' && src[j] !== '\r') j++
        del.push([i, j])
        i = j
        continue
      }
      if (c === '/' && src[i + 1] === '*') {
        const close = src.indexOf('*/', i + 2)
        const j = close === -1 ? n : close + 2
        del.push([i, j])
        i = j
        continue
      }
      if (c === '"' || c === "'") {
        let j = i + 1
        while (j < n && src[j] !== c) j++
        i = j + 1
        continue
      }
      if (c === '{') {
        const end = commentOnlyContainerEnd(src, i)
        if (end !== -1) {
          del.push([i, end])
          last = { type: 'value' }
          i = end
          continue
        }
        stack.push({ kind: 'code', brace: 0, endOnBrace: true })
        last = { type: 'punct', text: '{' }
        i++
        continue
      }
      if (c === '/' && src[i + 1] === '>') {
        stack.pop()
        last = { type: 'value' }
        i += 2
        continue
      }
      if (c === '>') {
        f.kind = 'jsxChildren'
        i++
        continue
      }
      i++
      continue
    }

    if (f.kind === 'jsxChildren') {
      if (c === '{') {
        const end = commentOnlyContainerEnd(src, i)
        if (end !== -1) {
          del.push([i, end])
          last = { type: 'value' }
          i = end
          continue
        }
        stack.push({ kind: 'code', brace: 0, endOnBrace: true })
        last = { type: 'punct', text: '{' }
        i++
        continue
      }
      if (c === '<' && src[i + 1] === '/') {
        const close = src.indexOf('>', i)
        stack.pop()
        last = { type: 'value' }
        i = close === -1 ? n : close + 1
        continue
      }
      if (c === '<') {
        stack.push({ kind: 'jsxTag' })
        i++
        continue
      }
      i++
      continue
    }
  }

  if (stack.length !== 1) {
    console.warn(`  ! unbalanced scan state (${stack.length - 1} frames open) `)
  }
  return del
}

function stripCss(src) {
  const del = []
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src[i]
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j += 2
        else j++
      }
      i = j + 1
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2)
      const j = close === -1 ? n : close + 2
      del.push([i, j])
      i = j
      continue
    }
    i++
  }
  return del
}

function stripHtmlComments(src) {
  const del = []
  let i = 0
  while (true) {
    const start = src.indexOf('<!--', i)
    if (start === -1) break
    const end = src.indexOf('-->', start + 4)
    const j = end === -1 ? src.length : end + 3
    del.push([start, j])
    i = j
  }
  return del
}

function stripToml(src) {
  const del = []
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src[i]
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < n && src[j] !== c) j++
      i = j + 1
      continue
    }
    if (c === '#') {
      let j = i
      while (j < n && src[j] !== '\n') j++
      del.push([i, j])
      i = j
      continue
    }
    i++
  }
  return del
}

// Converts raw comment ranges into deletions that also drop the whole line when
// the comment is the only thing on it, so no blank lines are left behind.
function expandRanges(src, ranges) {
  const n = src.length
  const expanded = ranges.map(([s, e]) => {
    const lineStart = src.lastIndexOf('\n', s - 1) + 1
    let lineEnd = src.indexOf('\n', e)
    if (lineEnd === -1) lineEnd = n
    const before = src.slice(lineStart, s)
    const after = src.slice(e, lineEnd)
    if (before.trim() === '' && after.trim() === '') {
      const stop = lineEnd < n ? lineEnd + 1 : n
      return [lineStart, stop]
    }
    if (before.trim() !== '' && after.trim() === '') {
      let stop = e
      while (stop < lineEnd && (src[stop] === ' ' || src[stop] === '\t')) stop++
      return [s, stop]
    }
    return [s, e]
  })

  expanded.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const range of expanded) {
    const lastRange = merged[merged.length - 1]
    if (lastRange && range[0] <= lastRange[1]) {
      lastRange[1] = Math.max(lastRange[1], range[1])
    } else {
      merged.push([range[0], range[1]])
    }
  }
  return merged
}

function apply(src, ranges) {
  let out = ''
  let cursor = 0
  for (const [s, e] of expandRanges(src, ranges)) {
    out += src.slice(cursor, s)
    cursor = e
  }
  out += src.slice(cursor)
  return out
}

function findFiles() {
  const files = []
  for (const p of ROOT_FILES) {
    if (fs.existsSync(path.join(ROOT, p))) files.push(path.join(ROOT, p))
  }
  const dirs = ['src', 'api', 'scripts', 'build', 'public']
  for (const dir of dirs) {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) continue
    for (const file of walk(abs)) files.push(file)
  }
  return files
}

const report = []
let totalRemoved = 0

for (const file of findFiles()) {
  const ext = path.extname(file)
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  if (rel.endsWith('.map')) continue
  const isJs = JS_EXT.has(ext)
  const isCss = ext === '.css'
  const isHtml = ext === '.html'
  const isToml = ext === '.toml'
  if (!isJs && !isCss && !isHtml && !isToml) continue

  const src = fs.readFileSync(file, 'utf8')
  let ranges
  if (isJs) {
    ranges = stripJs(src, ext === '.tsx' || ext === '.jsx' || (ext === '.js' && rel.startsWith('src/')))
    // CSS comments inside a <style> block of an HTML template string count too.
    let cursor = 0
    while (true) {
      const open = src.indexOf('<style', cursor)
      if (open === -1) break
      const close = src.indexOf('</style>', open)
      if (close === -1) break
      const inner = stripCss(src.slice(open, close))
      for (const [s, e] of inner) ranges.push([open + s, open + e])
      cursor = close + 8
    }
  } else if (isCss) ranges = stripCss(src)
  else if (isHtml) ranges = stripHtmlComments(src)
  else ranges = stripToml(src)

  if (!ranges.length) continue

  const out = apply(src, ranges)
  const removedLines = src.split('\n').length - out.split('\n').length
  const chars = ranges.reduce((sum, [s, e]) => sum + (e - s), 0)
  totalRemoved += chars
  report.push(`${rel}: ${ranges.length} comments, ${removedLines} lines, ${chars} chars`)
  if (!DRY) fs.writeFileSync(file, out, 'utf8')
}

console.log(DRY ? 'DRY RUN' : 'WROTE FILES')
console.log(report.join('\n'))
console.log(`\nfiles touched: ${report.length}, comment chars removed: ${totalRemoved}`)
