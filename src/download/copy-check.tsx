import { useState } from 'react'
import './copy-check.css'


const CURRENT_SHORT = __PLU_COMMIT__
const HISTORY: [string, string][] = __PLU_HISTORY__
const DEPTH = HISTORY.length

const META_COMMIT = /<meta\s+name=["']plutonium-commit["']\s+content=["']([^"']+)["']/i
const META_BUILT = /<meta\s+name=["']plutonium-built["']\s+content=["']([^"']+)["']/i
const SVG_COMMIT = /&lt;meta name=&quot;plutonium-commit&quot; content=&quot;([^&"]+)&quot;/
const SVG_BUILT = /&lt;meta name=&quot;plutonium-built&quot; content=&quot;([^&"]+)&quot;/
const IS_PLUTONIUM = /<title>\s*Plutonium/i
const IS_THIS_PAGE = /<title>\s*Plutonium\s+single file/i

type Verdict = 'same' | 'behind' | 'newer' | 'unknown' | 'unstamped' | 'invalid' | 'page'

type Result = {
  name: string
  size: string
  commit: string | null
  built: string
  age: string
  verdict: Verdict
  commits: number | null
}

function formatSize(bytes: number) {
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatBuilt(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

function formatAge(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} old`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} old`
  const days = Math.round(hours / 24)
  if (days < 60) return `${days} day${days === 1 ? '' : 's'} old`
  return `${Math.round(days / 30)} months old`
}

async function inspect(file: File): Promise<Result> {
  const head = await file.slice(0, 512 * 1024).text()
  const commit = META_COMMIT.exec(head)?.[1] ?? SVG_COMMIT.exec(head)?.[1] ?? null
  const iso = META_BUILT.exec(head)?.[1] ?? SVG_BUILT.exec(head)?.[1] ?? null

  const result: Result = {
    name: file.name,
    size: formatSize(file.size),
    commit,
    built: iso ? formatBuilt(iso) : '',
    age: iso ? formatAge(iso) : '',
    verdict: 'unknown',
    commits: null,
  }

  if (!commit) {
    if (IS_THIS_PAGE.test(head)) result.verdict = 'page'
    else result.verdict = IS_PLUTONIUM.test(head) ? 'unstamped' : 'invalid'
    return result
  }

  const index = HISTORY.findIndex(([sha]) => commit === sha || commit.startsWith(sha))

  if (index === 0) {
    result.verdict = 'same'
  } else if (index > 0) {
    result.verdict = 'behind'
    result.commits = index
  } else if (iso && new Date(iso).getTime() > new Date(HISTORY[0]?.[1] ?? 0).getTime()) {
    result.verdict = 'newer'
  }

  return result
}

function verdictText(result: Result) {
  switch (result.verdict) {
    case 'same':
      return 'Up to date: this is the current build.'
    case 'behind':
      return result.commits
        ? `${result.commits} commit${result.commits === 1 ? '' : 's'} behind the current build (${CURRENT_SHORT}).`
        : `Behind the current build (${CURRENT_SHORT}).`
    case 'newer':
      return `Newer than this page's build (${CURRENT_SHORT}).`
    case 'unstamped':
      return 'No build stamp in this copy, so its age is unknown. It predates build stamps.'
    case 'invalid':
      return "That doesn't look like a Plutonium single file."
    case 'page':
      return 'That is the download page itself. Choose the plutonium.html file you saved.'
    default:
      return `Not in this build's history: another branch, or older than the last ${DEPTH} builds.`
  }
}

function verdictClass(verdict: Verdict) {
  if (verdict === 'same') return 'is-ok'
  if (verdict === 'behind') return 'is-stale'
  if (verdict === 'invalid') return 'is-bad'
  return 'is-muted'
}

export default function CopyCheck() {
  const [result, setResult] = useState<Result | null>(null)
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)

  function take(file: File | null | undefined) {
    if (!file) return
    setReading(true)
    setResult(null)
    void inspect(file).then((next) => {
      setResult(next)
      setReading(false)
    })
  }

  return (
    <section className="copy-check">
      <p className="copy-check__lead">Already have a copy? Drop it here to see how old it is.</p>

      <label
        className={`copy-check__pick${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          take(event.dataTransfer.files?.[0])
        }}
      >
        <input
          type="file"
          accept=".html,.htm,text/html"
          onChange={(event) => {
            take(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <span>{reading ? 'Reading…' : 'Choose a file'}</span>
      </label>

      {result ? (
        <div className="copy-check__result">
          <p className="copy-check__file">
            {result.name} · {result.size}
          </p>
          {result.built ? (
            <p className="copy-check__meta">
              Built {result.built}
              {result.age ? ` · ${result.age}` : ''} · {result.commit?.slice(0, 7)}
            </p>
          ) : null}
          <p className={`copy-check__verdict ${verdictClass(result.verdict)}`}>{verdictText(result)}</p>
          {result.verdict === 'behind' || result.verdict === 'unknown' || result.verdict === 'unstamped' ? (
            <a className="copy-check__latest" href="./plutonium.html" download="plutonium.html">
              Download the latest
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
