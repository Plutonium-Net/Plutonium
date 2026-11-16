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
  console.error(`[pages] unknown target "${target}", expected one of: ${TARGETS.join(', ')}`)
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
  const xhtml = toXhtml(html)

  const sizes = { html: formatSize(html), svg: formatSize(svg), xhtml: formatSize(xhtml) }
  process.env.PLU_SIZE = sizes.html
  process.env.PLU_SVG_SIZE = sizes.svg
  process.env.PLU_XHTML_SIZE = sizes.xhtml
  await build({ root: ROOT, configFile: join(ROOT, 'vite.config.download.js') })

  assemble(html, svg, xhtml, sizes)
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
 * Escape the HTML so it can ride inside an XML attribute.
 *
 * XML allows no control characters at all, and the bundle carries a couple of
 * raw U+001F separators from deduplicated string literals. Their `\u001f`
 * escapes are the same value to JavaScript, and legal here.
 *
 * Newlines become character references because an XML parser folds literal
 * line breaks in attribute values into spaces, and the bundled JavaScript may
 * need them.
 */
function escapeForAttribute(html) {
  return html
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;')
}

/**
 * The app inside an iframe whose document is the attribute.
 *
 * XML documents cannot hold HTML markup directly. The HTML parser's leniency
 * is exactly what a React bundle needs, so the markup rides in `srcdoc`. The
 * iframe keeps the wrapper's origin, so storage and canvas behave normally,
 * and it fills the viewport the page expects.
 */
function frame(escaped) {
  return `<iframe xmlns="http://www.w3.org/1999/xhtml" title="Plutonium" width="100%" height="100%" style="border:0;display:block" srcdoc="${escaped}"></iframe>`
}

/** The same page as a single SVG. */
function toSvg(html) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  <title>Plutonium</title>
  <desc>The whole app in one file that happens to be an SVG: the page rides in an iframe's srcdoc.</desc>
  <foreignObject x="0" y="0" width="100%" height="100%">
    ${frame(escapeForAttribute(html))}
  </foreignObject>
</svg>
`
}

/** The same page as a single XHTML document. */
function toXhtml(html) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Plutonium</title>
    <style>html, body { margin: 0; height: 100%; background: #000; } iframe { display: block; width: 100%; height: 100%; border: 0; }</style>
  </head>
  <body>
    ${frame(escapeForAttribute(html))}
  </body>
</html>
`
}

function assemble(html, svg, xhtml, sizes) {
  rmSync(DOWNLOAD_DIR, { recursive: true, force: true })
  mkdirSync(DOWNLOAD_DIR, { recursive: true })

  // The entry is `download.html`; Pages serves the directory's index.html.
  copyFileSync(join(PAGE_DIR, 'download.html'), join(DOWNLOAD_DIR, 'index.html'))
  const files = { 'plutonium.html': html, 'plutonium.svg': svg, 'plutonium.xhtml': xhtml }
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(DOWNLOAD_DIR, name), contents)

  // The page declares this as its icon, so it has to ship beside it.
  copyFileSync(join(ROOT, 'public/icon-white.png'), join(DOWNLOAD_DIR, 'icon-white.png'))

  // A stable URL is friendlier to bookmark; no-cache keeps it honest across
  // deployments instead of letting a browser hold on to an older file.
  const headers = ['/index.html', ...Object.keys(files).map((name) => `/${name}`)]
  writeFileSync(
    join(DOWNLOAD_DIR, '_headers'),
    headers.map((path) => `${path}\n  Cache-Control: no-cache`).join('\n\n') + '\n',
  )

  const sha = process.env.CF_PAGES_COMMIT_SHA || git(['rev-parse', 'HEAD'], 'unknown')
  console.log(
    `[pages] download page ready: dist-download (commit ${sha.slice(0, 7)}, html ${sizes.html}, svg ${sizes.svg}, xhtml ${sizes.xhtml})`,
  )
}
