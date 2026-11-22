import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inlineImageRefs } from './single-file.mjs'

// Turns a normal Vite build into the three files the stable client loads from
// jsDelivr: app.js (entry chunk), app.css and payload.json. Images referenced by
// absolute /img/... paths are inlined exactly like the self-contained build does,
// because those paths would otherwise resolve against the CDN root.
export function cdnBundle({ images = {}, payload = null } = {}) {
  return {
    name: 'plutonium-cdn-bundle',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (name.toLowerCase().endsWith('.html')) delete bundle[name]
      }

      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') {
          file.code = inlineImageRefs(file.code, images)
        } else if (String(file.fileName).toLowerCase().endsWith('.css')) {
          file.source = inlineImageRefs(String(file.source), images)
        }
      }
    },
    writeBundle(options) {
      if (!payload) return
      if (!options.dir) throw new Error('cdn-bundle: the build needs an output directory to write payload.json')
      writeFileSync(join(options.dir, 'payload.json'), JSON.stringify(payload))
    },
  }
}
