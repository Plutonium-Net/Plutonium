/**
 * The single-file inliner, shared by the lite build and the download page.
 *
 * Both targets ship one HTML file with no siblings: the entry chunk, the
 * stylesheet and every asset have to ride inside the page, and runtime `/img/…`
 * references are rewritten to data URIs because nothing sits beside the file.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
}

const extOf = (file) => file.split('.').pop()?.toLowerCase() ?? ''

const dataUri = (file) =>
  `data:${MIME[extOf(file)] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`

/** Every image under `public/img`, keyed by the URL the app asks for it by. */
export function collectImages(publicDir, dir = join(publicDir, 'img'), out = {}) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectImages(publicDir, full, out)
    } else if (MIME[extOf(entry.name)]) {
      out['/' + relative(publicDir, full).split(sep).join('/')] = dataUri(full)
    }
  }
  return out
}

/** The handful of marks kept at the public root, e.g. `/icon-white.png`. */
export function collectRootImages(publicDir, out = {}) {
  for (const entry of readdirSync(publicDir, { withFileTypes: true })) {
    if (!entry.isFile() || !MIME[extOf(entry.name)]) continue
    out[`/${entry.name}`] = dataUri(join(publicDir, entry.name))
  }
  return out
}

/** The catalogs the app would otherwise fetch from `/data`, plus its tile art. */
export function catalogPayload(publicDir, images) {
  const apps = JSON.parse(readFileSync(join(publicDir, 'data', 'apps.json'), 'utf8'))
  const raw = JSON.parse(readFileSync(join(publicDir, 'data', 'app-servers.json'), 'utf8'))

  // `flagSrc` lives inside the injected JSON, where the bundle's string-literal
  // rewrite cannot reach it, so the flags are swapped here instead.
  const servers = {
    defaultId: raw.default || raw.servers?.[0]?.id || '',
    servers: (raw.servers || []).map((server) => ({
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

  return { apps, servers, art }
}

/**
 * @param images        URL -> data URI, used to rewrite the bundle's literals.
 * @param payload       Value for `window.__PLU_EMBED__`; omit when unused.
 * @param stripEngineTags  Drop the vendored proxy <script> tags (no workers here).
 * @param meta          Build stamp written into the head, read back by the
 *                      download page when someone uploads an old copy.
 */
export function singleFile({ images = {}, payload = null, stripEngineTags = false, meta = null } = {}) {
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

      if (meta) {
        // First thing in the head, so a copy check can read it without pulling
        // the whole page into memory.
        const stamp = [
          `<meta name="plutonium-commit" content="${String(meta.commit).replace(/"/g, '&quot;')}">`,
          `<meta name="plutonium-built" content="${String(meta.builtAt).replace(/"/g, '&quot;')}">`,
        ].join('\n    ')
        html = html.replace(/<head[^>]*>/i, (tag) => `${tag}\n    ${stamp}`)
      }

      if (stripEngineTags) {
        // The engine bundles are separate files; here their tags would only 404.
        html = html.replace(/\s*<!-- Vendored engine globals[\s\S]*?-->/, '')
        html = html.replace(
          /\s*<script[^>]+src="[^"]*(?:bridge\/index|core\/bundle|core\/config|runtime\/all|js\/runtimev2)\.js"[^>]*><\/script>/g,
          '',
        )
      }

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

      if (payload) {
        const data = JSON.stringify(payload).replace(/</g, '\\u003c')
        html = html.replace('</head>', `    <script>window.__PLU_EMBED__=${data};</script>\n  </head>`)
      }

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
