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

export function commitFull() {
  return process.env.CF_PAGES_COMMIT_SHA || git(['rev-parse', 'HEAD'], 'unknown')
}

export function commitSha() {
  return commitFull().slice(0, 7)
}

export function builtAt() {
  return git(['log', '-1', '--format=%cI']) || new Date().toISOString()
}

export function history(limit = 500) {
  const log = git(['log', `-n${limit}`, '--format=%h%x09%cI'])
  if (!log) return []
  return log
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(([sha, at]) => Boolean(sha) && Boolean(at))
    .map(([sha, at]) => [sha, at])
}
