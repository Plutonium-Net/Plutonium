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


const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url))
const images = { ...collectRootImages(PUBLIC_DIR), ...collectImages(PUBLIC_DIR) }

export default defineConfig({
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
      inlineFavicon: true,
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
    chunkSizeWarningLimit: 2048,
  },
})
