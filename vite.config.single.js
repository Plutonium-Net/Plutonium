import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import {
  catalogPayload,
  collectImages,
  collectRootImages,
  singleFile,
} from './build/single-file.mjs'
import { builtAt, commitFull, commitSha } from './scripts/build-info.mjs'

/**
 * The single-file ("lite") build: one `dist-single/index.html` that opens from
 * disk.
 *
 * A page on `file://` cannot register a service worker, and a worker can never
 * be a data: or blob: URL, so the three relay engines (Ultraviolet, Scramjet
 * V1, Scramjet V2) are absent from this target: `src/lib/net/engines.ts` lists
 * only the host proxies when `window.__PLU_EMBED__` is present. Everything else
 * (shell, games, media, AI, apps) ships inside the page.
 *
 * The normal build is untouched; this is a second, additive target.
 */

const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url))
const images = { ...collectRootImages(PUBLIC_DIR), ...collectImages(PUBLIC_DIR) }

export default defineConfig({
  // No sibling files: fonts, catalogs and art all ride inside the page.
  publicDir: false,
  base: './',
  define: { __PLU_COMMIT__: JSON.stringify(commitSha()) },
  plugins: [
    react(),
    tailwindcss(),
    singleFile({
      images,
      payload: catalogPayload(PUBLIC_DIR, images),
      stripEngineTags: true,
      meta: { commit: commitFull(), builtAt: builtAt() },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist-single',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 32 * 1024 * 1024,
    modulePreload: false,
    // One chunk is the point here, so the default 500 kB warning is noise.
    chunkSizeWarningLimit: 2048,
  },
})
