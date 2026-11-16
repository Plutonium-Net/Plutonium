import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * The single-file build: one `dist-single/index.html` that opens from disk.
 *
 * A page on `file://` cannot register a service worker, and a worker can never
 * be a data: or blob: URL — so the three relay engines (Ultraviolet, Scramjet
 * V1, Scramjet V2) are absent from this target: `src/lib/net/engines.ts` lists
 * only the host proxies when `window.__PLU_EMBED__` is present. Everything else
 * (shell, games, media, AI, apps) ships inside the page.
 *
 * The normal build is untouched; this is a second, additive target.
 */

const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url))
const OUT_DIR = 'dist-single'

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
}

function extOf(file) {
  return file.split('.').pop()?.toLowerCase() ?? ''
}

function dataUri(file) {
  return `data:${MIME[extOf(file)] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`
}

/** Every image under `public/img`, keyed by the URL the app asks for it by. */
function collectImages(dir = join(PUBLIC_DIR, 'img'), out = {}) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectImages(full, out)
    } else if (MIME[extOf(entry.name)]) {
      out['/' + relative(PUBLIC_DIR, full).split(sep).join('/')] = dataUri(full)
    }
  }
  return out
}

/** The handful of marks kept at the public root, e.g. `/icon-white.png`. */
function collectRootImages(out = {}) {
  for (const entry of readdirSync(PUBLIC_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !MIME[extOf(entry.name)]) continue
    out[`/${entry.name}`] = dataUri(join(PUBLIC_DIR, entry.name))
  }
  return out
}

function readJson(name) {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, 'data', name), 'utf8'))
}

function singleFile({ images, apps, rawServers }) {
  // `flagSrc` lives inside the inlined JSON, where the bundle's string-literal
  // rewrite cannot reach it, so the flags are swapped here instead.
  const servers = {
    defaultId: rawServers.default || rawServers.servers?.[0]?.id || '',
    servers: (rawServers.servers || []).map((server) => ({
      ...server,
      // The catalog writes these without the leading slash.
      flagSrc: images[server.flagSrc] ?? images[`/${server.flagSrc}`] ?? server.flagSrc,
    })),
  }

  const art = {}
  for (const [url, uri] of Object.entries(images)) {
    const match = /^\/img\/apps\/([^/]+)\.[a-z0-9]+$/i.exec(url)
    if (match) art[match[1]] = uri
  }

  const payload = JSON.stringify({ apps, servers, art }).replace(/</g, '\\u003c')

  /**
   * Turns `/img/...` string literals in the bundle into data URIs. The minifier
   * emits some of them as template literals, so all three quotings are covered.
   */
  function inlineImages(code) {
    let next = code
    for (const [url, uri] of Object.entries(images)) {
      const quoted = JSON.stringify(uri)
      next = next
        .split(`"${url}"`)
        .join(quoted)
        .split(`'${url}'`)
        .join(quoted)
        .split('`' + url + '`')
        .join('`' + uri + '`')
    }
    return next
  }

  return {
    name: 'plutonium-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlFile = Object.values(bundle).find(
        (file) => file.type === 'asset' && file.fileName.endsWith('.html'),
      )
      if (!htmlFile) throw new Error('single-file: no HTML entry in the bundle')

      let html = String(htmlFile.source)

      // The engine bundles are separate files in the normal build; here their
      // tags would only 404, so they go along with the comment describing them.
      html = html.replace(/\s*<!-- Vendored engine globals[\s\S]*?-->/, '')
      html = html.replace(
        /\s*<script[^>]+src="[^"]*(?:bridge\/index|core\/bundle|core\/config|runtime\/all|js\/runtimev2)\.js"[^>]*><\/script>/g,
        '',
      )

      const assetFor = (href) => bundle[String(href).replace(/^\.?\//, '')]

      html = html.replace(/\s*<link[^>]+rel="stylesheet"[^>]*>/g, (tag) => {
        const href = /href="([^"]+)"/.exec(tag)?.[1]
        const file = href ? assetFor(href) : undefined
        if (!file || file.type !== 'asset') return tag
        delete bundle[file.fileName]
        return `<style>\n${String(file.source)}\n</style>`
      })

      html = html.replace(
        /\s*<script[^>]+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
        (tag, src) => {
          const file = assetFor(src)
          if (!file || file.type !== 'chunk') return tag
          const code = inlineImages(file.code).replace(/<\/script/gi, '<\\/script')
          delete bundle[file.fileName]
          return `<script type="module">\n${code}\n</script>`
        },
      )

      // Before the module script: the catalog has to be readable on first paint.
      html = html.replace('</head>', `    <script>window.__PLU_EMBED__=${payload};</script>\n  </head>`)

      htmlFile.source = html

      for (const [name, file] of Object.entries(bundle)) {
        if (name === htmlFile.fileName) continue
        this.warn(
          file.type === 'chunk'
            ? `single-file: dynamic chunk left as a separate file: ${name}`
            : `single-file: asset left as a separate file: ${name}`,
        )
      }
    },
  }
}

export default defineConfig({
  // No sibling files: fonts, catalogs and art all ride inside the page.
  publicDir: false,
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    singleFile({
      images: { ...collectRootImages(), ...collectImages() },
      apps: readJson('apps.json'),
      rawServers: readJson('app-servers.json'),
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 32 * 1024 * 1024,
    modulePreload: false,
    // One chunk is the point here, so the default 500 kB warning is noise.
    chunkSizeWarningLimit: 2048,
  },
})
