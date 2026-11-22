#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { build } from 'vite'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
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

// The lite artifacts are wrappers: plutonium.html is the client itself and the
// SVG/XHTML variants carry it in an iframe, so all three load the published
// build from jsDelivr instead of inlining it. `npm run build:single` still
// produces the fully self-contained HTML when one is needed.
async function download() {
  const html = readFileSync(join(ROOT, 'public/client.html'), 'utf8')
  const svg = toSvg(html)
  const xhtml = toXhtml(html)

  const sizes = { html: formatSize(html), svg: formatSize(svg), xhtml: formatSize(xhtml) }
  process.env.PLU_SIZE = sizes.html
  process.env.PLU_SVG_SIZE = sizes.svg
  process.env.PLU_XHTML_SIZE = sizes.xhtml
  await build({ root: ROOT, configFile: join(ROOT, 'vite.config.download.js') })

  assemble(html, svg, xhtml, sizes)
}

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return fallback
  }
}

function formatSize(contents) {
  const bytes = Buffer.byteLength(contents, 'utf8')
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function escapeForAttribute(html) {
  return html
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;')
}

function frame(escaped) {
  return `<iframe xmlns="http://www.w3.org/1999/xhtml" title="Plutonium" width="100%" height="100%" style="border:0;display:block" srcdoc="${escaped}"></iframe>`
}

function toSvg(html) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  <title>Plutonium</title>
  <desc>The lite client in a file that happens to be an SVG: the page rides in an iframe's srcdoc and loads the latest build from jsDelivr.</desc>
  <foreignObject x="0" y="0" width="100%" height="100%">
    ${frame(escapeForAttribute(html))}
  </foreignObject>
</svg>
`
}

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

  copyFileSync(join(PAGE_DIR, 'download.html'), join(DOWNLOAD_DIR, 'index.html'))
  const files = { 'plutonium.html': html, 'plutonium.svg': svg, 'plutonium.xhtml': xhtml }
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(DOWNLOAD_DIR, name), contents)

  copyFileSync(join(ROOT, 'public/icon-white.png'), join(DOWNLOAD_DIR, 'icon-white.png'))

  const headers = ['/index.html', ...Object.keys(files).map((name) => `/${name}`)]
  writeFileSync(
    join(DOWNLOAD_DIR, '_headers'),
    headers.map((path) => `${path}\n  Cache-Control: no-cache`).join('\n\n') + '\n',
  )

  const sha = process.env.CF_PAGES_COMMIT_SHA || git(['rev-parse', 'HEAD'], 'unknown')
  console.log(
    `[pages] lite page ready: dist-download (commit ${sha.slice(0, 7)}, html ${sizes.html}, svg ${sizes.svg}, xhtml ${sizes.xhtml})`,
  )
}
