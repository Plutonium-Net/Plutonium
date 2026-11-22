#!/usr/bin/env node

/**
 * Builds the split-asset single-file bundle (dist-cdn) and publishes it to a
 * dedicated GitHub repo, then purges the jsDelivr copies that public/client.html
 * reads. Auth is a GitHub App only: PLU_GITHUB_APP_ID and
 * PLU_GITHUB_APP_PRIVATE_KEY_BASE64. See SINGLEFILE.md for setup.
 *
 *   node scripts/publish-single.mjs             build, push, purge
 *   node scripts/publish-single.mjs --dry-run   build and validate only
 *   node scripts/publish-single.mjs --no-purge  push without asking jsDelivr to purge
 */

import { createSign } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { build } from 'vite'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT_DIR = join(ROOT, 'dist-cdn')

const REPO = (process.env.PLU_CDN_REPO || 'Plutonium-Net/SingleFile-SRC').trim()
const BRANCH = (process.env.PLU_CDN_BRANCH || 'main').trim()
const APP_ID = (process.env.PLU_GITHUB_APP_ID || '').trim()
const APP_KEY = (process.env.PLU_GITHUB_APP_PRIVATE_KEY_BASE64 || '').trim()

const flags = new Set(process.argv.slice(2))
const DRY_RUN = flags.has('--dry-run') || process.env.PLU_CDN_DRY_RUN === '1'
const PURGE = !flags.has('--no-purge')

const API = 'https://api.github.com'
const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_PACKAGE_BYTES = 50 * 1024 * 1024
const REQUIRED = ['app.js', 'app.css', 'payload.json']
const SKIP = /\.(map|html)$/i

main().catch((error) => {
  console.error(`[publish] ${error.message}`)
  process.exitCode = 1
})

async function main() {
  if (!DRY_RUN && (!APP_ID || !APP_KEY)) {
    throw new Error(
      'set PLU_GITHUB_APP_ID and PLU_GITHUB_APP_PRIVATE_KEY_BASE64 (or run with --dry-run)',
    )
  }

  console.log(`[publish] building dist-cdn for ${REPO}@${BRANCH}`)
  await build({ root: ROOT, configFile: join(ROOT, 'vite.config.cdn.js'), logLevel: 'warn' })

  const files = collect(OUT_DIR)
  const total = files.reduce((sum, file) => sum + file.bytes, 0)
  validate(files, total)

  for (const file of files) console.log(`[publish]   ${file.path.padEnd(28)} ${format(file.bytes)}`)

  if (DRY_RUN) {
    console.log(`[publish] dry run: ${files.length} file(s), ${format(total)} total — nothing pushed, nothing purged`)
    return
  }

  const token = await installationToken()
  const sha = await publish(token, files)

  console.log(`[publish] pushed ${sha.slice(0, 7)} to ${REPO}@${BRANCH} (${files.length} file(s), ${format(total)})`)

  if (PURGE) await purge(files)

  console.log(`[publish] client: https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/app.js`)
}

function collect(dir) {
  if (!existsSync(dir)) throw new Error(`missing build output: ${relative(ROOT, dir)}`)

  const files = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile() || entry.name === '.DS_Store' || SKIP.test(entry.name)) continue
      const content = readFileSync(full)
      files.push({ path: relative(dir, full).split(sep).join('/'), bytes: content.length, content })
    }
  }

  walk(dir)
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

function validate(files, total) {
  const missing = REQUIRED.filter((name) => !files.some((file) => file.path === name))
  if (missing.length) throw new Error(`build output is missing ${missing.join(', ')}`)

  const oversized = files.filter((file) => file.bytes > MAX_FILE_BYTES)
  if (oversized.length) {
    throw new Error(
      `jsDelivr rejects single files over 20 MB: ${oversized.map((file) => `${file.path} (${format(file.bytes)})`).join(', ')}`,
    )
  }

  if (total > MAX_PACKAGE_BYTES) {
    console.warn(`[publish] warning: ${format(total)} across all files is over jsDelivr's 50 MB package limit`)
  }
}

function format(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(2)} MB`
}

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function privateKey() {
  let pem = ''
  try {
    pem = Buffer.from(APP_KEY, 'base64').toString('utf8').trim()
  } catch {
    throw new Error('PLU_GITHUB_APP_PRIVATE_KEY_BASE64 is not valid base64')
  }
  if (!pem.includes('BEGIN') || !pem.includes('PRIVATE KEY')) {
    throw new Error('PLU_GITHUB_APP_PRIVATE_KEY_BASE64 does not decode to a PEM private key')
  }
  return pem
}

function appJwt() {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 540,
      iss: Number.isFinite(Number(APP_ID)) ? Number(APP_ID) : APP_ID,
    }),
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  const signature = signer
    .sign(privateKey())
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${header}.${payload}.${signature}`
}

async function api(token, method, path, body) {
  const response = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'plutonium-publish-single',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const error = new Error(
      `${method} ${path} -> ${response.status} ${data?.message || text.slice(0, 200)}`,
    )
    error.status = response.status
    throw error
  }

  return data
}

async function installationToken() {
  const jwt = appJwt()

  let installation
  try {
    installation = await api(jwt, 'GET', `/repos/${REPO}/installation`)
  } catch (error) {
    if (error.status === 404) {
      throw new Error(`GitHub App ${APP_ID} is not installed on ${REPO} (install it with Contents: read and write)`)
    }
    throw error
  }

  const access = await api(jwt, 'POST', `/app/installations/${installation.id}/access_tokens`, {})
  console.log(
    `[publish] app ${APP_ID}, installation ${installation.id} (${installation.account?.login ?? 'unknown'}), token for ${access.expires_at}`,
  )
  return access.token
}

async function publish(token, files) {
  const repoPath = `/repos/${REPO}`

  const blobs = []
  for (const file of files) {
    const blob = await api(token, 'POST', `${repoPath}/git/blobs`, {
      content: file.content.toString('base64'),
      encoding: 'base64',
    })
    blobs.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha })
  }

  const tree = await api(token, 'POST', `${repoPath}/git/trees`, { tree: blobs })
  // Parentless commit: republishing replaces history instead of stacking 13 MB
  // blobs on top of each other.
  const commit = await api(token, 'POST', `${repoPath}/git/commits`, {
    message: `Publish single-file assets (${new Date().toISOString()})`,
    tree: tree.sha,
    parents: [],
  })

  try {
    await api(token, 'PATCH', `${repoPath}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true })
  } catch (error) {
    if (!/-> (404|422)\b/.test(error.message)) throw error
    await api(token, 'POST', `${repoPath}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: commit.sha })
  }

  return commit.sha
}

async function purge(files) {
  if (!files.length) return

  for (const file of files) {
    const url = `https://purge.jsdelivr.net/gh/${REPO}@${BRANCH}/${file.path}`
    try {
      const response = await fetch(url)
      if (!response.ok) {
        console.warn(`[publish] purge failed for ${file.path}: HTTP ${response.status}`)
        continue
      }
      const result = await response.json().catch(() => null)
      const status = result?.status ?? 'ok'
      console.log(`[publish] purged ${file.path} (${status})`)
    } catch (error) {
      console.warn(`[publish] purge failed for ${file.path}: ${error.message}`)
    }
  }

  console.log('[publish] jsDelivr can take a minute or two to serve the new build everywhere')
}
