#!/usr/bin/env node
/**
 * The Cloudflare Pages entry point for this repo.
 *
 *   npm run build:pages                # the site      -> dist/
 *   npm run build:pages -- download    # one-file page -> dist-download/
 *
 * The target also comes from PLU_BUILD_TARGET, so a second Pages project can
 * keep a single build command (`npm run build:pages`) and set the variable in
 * its environment instead of passing an argument.
 *
 * Pages checks out one commit and runs this once per deployment, so the page
 * and the file it hands over are both cut from the commit that triggered it.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { build } from 'vite'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SINGLE_DIR = join(ROOT, 'dist-single')
const PAGE_DIR = join(ROOT, 'dist-download-page')
const DOWNLOAD_DIR = join(ROOT, 'dist-download')

const TARGETS = ['site', 'download']
const target = (process.argv[2] || process.env.PLU_BUILD_TARGET || 'site').trim().toLowerCase()

if (!TARGETS.includes(target)) {
  console.error(`[pages] unknown target "${target}" — expected one of: ${TARGETS.join(', ')}`)
  process.exit(1)
}

if (target === 'site') {
  await build({ root: ROOT })
} else {
  // The file first: the page prints its size, so it has to exist before the
  // page is built.
  await build({ root: ROOT, configFile: join(ROOT, 'vite.config.single.js') })

  const size = formatSize(statSync(join(SINGLE_DIR, 'index.html')).size)
  process.env.PLU_SIZE = size
  await build({ root: ROOT, configFile: join(ROOT, 'vite.config.download.js') })

  assemble(size)
}

/** Git may be absent in some build images; the log degrades rather than fails. */
function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return fallback
  }
}

function formatSize(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function assemble(size) {
  rmSync(DOWNLOAD_DIR, { recursive: true, force: true })
  mkdirSync(DOWNLOAD_DIR, { recursive: true })

  // The entry is `download.html`; Pages serves the directory's index.html.
  copyFileSync(join(PAGE_DIR, 'download.html'), join(DOWNLOAD_DIR, 'index.html'))
  copyFileSync(join(SINGLE_DIR, 'index.html'), join(DOWNLOAD_DIR, 'plutonium.html'))

  // A stable URL is friendlier to bookmark; no-cache keeps it honest across
  // deployments instead of letting a browser hold on to an older file.
  writeFileSync(
    join(DOWNLOAD_DIR, '_headers'),
    ['/index.html', '  Cache-Control: no-cache', '', '/plutonium.html', '  Cache-Control: no-cache', ''].join('\n'),
  )

  const sha = process.env.CF_PAGES_COMMIT_SHA || git(['rev-parse', 'HEAD'], 'unknown')
  console.log(`[pages] download page ready: dist-download (commit ${sha.slice(0, 7)}, ${size})`)
}
