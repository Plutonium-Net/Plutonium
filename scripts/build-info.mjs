/**
 * The commit a build was cut from, for the stamp on the home screen.
 *
 * Cloudflare Pages exports CF_PAGES_COMMIT_SHA; everywhere else the checked-out
 * HEAD is the answer, and a machine without git still gets a readable value.
 */

import { execFileSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return fallback
  }
}

/** The full SHA, which is what a single file's build stamp records. */
export function commitFull() {
  return process.env.CF_PAGES_COMMIT_SHA || git(['rev-parse', 'HEAD'], 'unknown')
}

/** The seven-character form the home screen prints. */
export function commitSha() {
  return commitFull().slice(0, 7)
}

/** When that commit was made, ISO 8601. */
export function builtAt() {
  return git(['log', '-1', '--format=%cI']) || new Date().toISOString()
}

/**
 * Newest-first `[sha, iso]` pairs of this branch.
 *
 * The download page bakes this in so an uploaded copy can be placed in the
 * history without asking GitHub — which answers quickly for a public repo and
 * not at all for this one.
 */
export function history(limit = 500) {
  const log = git(['log', `-n${limit}`, '--format=%h%x09%cI'])
  if (!log) return []
  return log
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(([sha, at]) => Boolean(sha) && Boolean(at))
    .map(([sha, at]) => [sha, at])
}
