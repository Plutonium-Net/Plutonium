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
 * Pages checks out one commit and runs this once per deployment, so the
 * download page bakes in the commit it was built from: each deployment
 * publishes the file for the commit that triggered it.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { build } from 'vite'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SINGLE_DIR = join(ROOT, 'dist-single')
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
  await build({ root: ROOT, configFile: join(ROOT, 'vite.config.single.js') })
  makeDownloadPage()
}

/** Git may be absent in some build images; the page degrades rather than fails. */
function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return fallback
  }
}

function escape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function makeDownloadPage() {
  rmSync(DOWNLOAD_DIR, { recursive: true, force: true })
  mkdirSync(DOWNLOAD_DIR, { recursive: true })

  const file = join(DOWNLOAD_DIR, 'plutonium.html')
  copyFileSync(join(SINGLE_DIR, 'index.html'), file)

  const bytes = statSync(file).size
  const size = `${(bytes / 1048576).toFixed(1)} MB`

  // Pages already exposes these; the git fallbacks cover a local run.
  const sha = process.env.CF_PAGES_COMMIT_SHA || git(['rev-parse', 'HEAD'], 'unknown')
  const branch = process.env.CF_PAGES_BRANCH || git(['rev-parse', '--abbrev-ref', 'HEAD'], 'unknown')
  const committedAt = git(['log', '-1', '--format=%cI']) || new Date().toISOString()
  const shortSha = sha.slice(0, 7)
  const built = `${committedAt.slice(0, 16).replace('T', ' ')} UTC`

  // A stable URL is friendlier to bookmark; no-cache keeps it honest across
  // deployments instead of letting a browser hold on to an older file.
  writeFileSync(
    join(DOWNLOAD_DIR, '_headers'),
    ['/index.html', '  Cache-Control: no-cache', '', '/plutonium.html', '  Cache-Control: no-cache', ''].join('\n'),
  )

  writeFileSync(
    join(DOWNLOAD_DIR, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Plutonium — single file</title>
    <style>
      :root {
        color-scheme: dark;
        --accent: #e8175d;
        --ink: #f4f4f6;
        --muted: #9b9ba6;
        --line: #ffffff1a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
        color: var(--ink);
        background: radial-gradient(120% 120% at 50% 0%, #1c1024 0%, #08080c 55%, #050508 100%);
        font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      main { width: min(640px, 100%); }
      .eyebrow {
        margin: 0 0 14px;
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--accent);
      }
      h1 {
        margin: 0 0 14px;
        font-size: clamp(30px, 5vw, 44px);
        line-height: 1.08;
        letter-spacing: -0.02em;
      }
      .lede { margin: 0 0 30px; max-width: 52ch; font-size: 17px; color: var(--muted); }
      .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 34px; }
      .btn {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 14px 22px;
        border: 1px solid transparent;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        font-weight: 600;
        text-decoration: none;
        transition: transform 0.15s ease, border-color 0.15s ease;
      }
      .btn:hover { transform: translateY(-1px); }
      .btn span { font-weight: 500; opacity: 0.8; font-variant-numeric: tabular-nums; }
      .btn--ghost { background: transparent; border-color: var(--line); color: var(--ink); }
      .btn--ghost:hover { border-color: #ffffff40; }
      dl {
        display: grid;
        gap: 1px;
        margin: 0 0 26px;
        border: 1px solid var(--line);
        border-radius: 14px;
        overflow: hidden;
        background: var(--line);
      }
      dl div {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 12px 16px;
        background: #0c0c11;
      }
      dt { font-size: 13px; color: var(--muted); }
      dd { margin: 0; font-size: 13px; text-align: right; word-break: break-all; }
      code { font: inherit; }
      .note { margin: 0; max-width: 60ch; font-size: 13px; color: #71717f; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Plutonium Network</p>
      <h1>Plutonium, in one file.</h1>
      <p class="lede">
        The shell, the game library, media, Stelena AI, the app catalog and the Compaxy browser in a
        single HTML file — keep it on disk, open it with a double-click.
      </p>

      <div class="actions">
        <a class="btn" href="./plutonium.html" download="plutonium.html">Download <span>${escape(size)}</span></a>
        <a class="btn btn--ghost" href="./plutonium.html">Open in browser</a>
      </div>

      <dl>
        <div><dt>Commit</dt><dd><code>${escape(shortSha)}</code></dd></div>
        <div><dt>Branch</dt><dd>${escape(branch)}</dd></div>
        <div><dt>Built</dt><dd>${escape(built)}</dd></div>
        <div><dt>Size</dt><dd>${escape(size)}</dd></div>
      </dl>

      <p class="note">
        Runs without a server. Browsing is limited to the host proxies (Compaxy, RH and Hyperbeam);
        the service-worker engines need an origin, so they are not in this build. Games, media, AI
        and apps still need a connection.
      </p>
    </main>
  </body>
</html>
`,
  )

  console.log(`[pages] download page ready: dist-download (commit ${shortSha}, ${size})`)
}
