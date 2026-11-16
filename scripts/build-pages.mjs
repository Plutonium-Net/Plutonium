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
 * and the files it hands over are all cut from the commit that triggered it.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  await download()
}

async function download() {
  // The single file first: the page prints the sizes, so both have to exist
  // before it is built.
  await build({ root: ROOT, configFile: join(ROOT, 'vite.config.single.js') })
  const html = readFileSync(join(SINGLE_DIR, 'index.html'), 'utf8')
  const svg = toSvg(html)

  const sizes = { html: formatSize(html), svg: formatSize(svg) }
  process.env.PLU_SIZE = sizes.html
  process.env.PLU_SVG_SIZE = sizes.svg
  await build({ root: ROOT, configFile: join(ROOT, 'vite.config.download.js') })

  assemble(html, svg, sizes)
}

/** Git may be absent in some build images; the log degrades rather than fails. */
function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return fallback
  }
}

function formatSize(contents) {
  return `${(Buffer.byteLength(contents, 'utf8') / 1048576).toFixed(1)} MB`
}

/**
 * The same page as a single SVG.
 *
 * An SVG is an XML document, so the HTML cannot just be pasted in: its scripts
 * would be parsed as XML. It rides in an `iframe srcdoc` instead — the iframe
 * still parses HTML leniently, keeps this file's origin (so storage and canvas
 * work), and fills the viewport the way the page expects.
 *
 * Only the attribute characters need escaping, plus newlines: an XML parser
 * folds literal line breaks in attribute values into spaces, and the bundled
 * JavaScript may need them.
 */
function toSvg(html) {
  // XML allows no control characters at all, and the bundle carries a couple of
  // raw U+001F separators from deduplicated string literals. Their `\u001f`
  // escapes are the same value to JavaScript, and legal here.
  const escaped = html
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  <title>Plutonium</title>
  <desc>The whole app in one file that happens to be an SVG: the page rides in an iframe's srcdoc.</desc>
  <foreignObject x="0" y="0" width="100%" height="100%">
    <iframe xmlns="http://www.w3.org/1999/xhtml" title="Plutonium" width="100%" height="100%" style="border:0;display:block" srcdoc="${escaped}"/>
  </foreignObject>
</svg>
`
}

function assemble(html, svg, sizes) {
  rmSync(DOWNLOAD_DIR, { recursive: true, force: true })
  mkdirSync(DOWNLOAD_DIR, { recursive: true })

  // The entry is `download.html`; Pages serves the directory's index.html.
  copyFileSync(join(PAGE_DIR, 'download.html'), join(DOWNLOAD_DIR, 'index.html'))
  writeFileSync(join(DOWNLOAD_DIR, 'plutonium.html'), html)
  writeFileSync(join(DOWNLOAD_DIR, 'plutonium.svg'), svg)

  // A stable URL is friendlier to bookmark; no-cache keeps it honest across
  // deployments instead of letting a browser hold on to an older file.
  writeFileSync(
    join(DOWNLOAD_DIR, '_headers'),
    ['/index.html', '  Cache-Control: no-cache', '', '/plutonium.html', '  Cache-Control: no-cache', '', '/plutonium.svg', '  Cache-Control: no-cache', ''].join('\n'),
  )

  const sha = process.env.CF_PAGES_COMMIT_SHA || git(['rev-parse', 'HEAD'], 'unknown')
  console.log(`[pages] download page ready: dist-download (commit ${sha.slice(0, 7)}, html ${sizes.html}, svg ${sizes.svg})`)
}
