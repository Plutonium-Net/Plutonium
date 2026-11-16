/**
 * The commit a build was cut from, for the stamp on the home screen.
 *
 * Cloudflare Pages exports CF_PAGES_COMMIT_SHA; everywhere else the checked-out
 * HEAD is the answer, and a machine without git still gets a readable value.
 */

import { execFileSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

export function commitSha() {
  const fromPages = process.env.CF_PAGES_COMMIT_SHA
  if (fromPages) return fromPages.slice(0, 7)
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}
