import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { cdnBundle } from './build/cdn.mjs'
import { catalogPayload, collectImages, collectRootImages } from './build/single-file.mjs'
import { commitSha } from './scripts/build-info.mjs'


const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url))
const images = { ...collectRootImages(PUBLIC_DIR), ...collectImages(PUBLIC_DIR) }

// Emits dist-cdn/app.js, dist-cdn/app.css and dist-cdn/payload.json for
// public/client.html to load from jsDelivr. See SINGLEFILE.md.
export default defineConfig({
  publicDir: false,
  base: './',
  define: { __PLU_COMMIT__: JSON.stringify(commitSha()) },
  plugins: [
    react(),
    tailwindcss(),
    cdnBundle({
      images,
      payload: catalogPayload(PUBLIC_DIR, images),
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist-cdn',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 32 * 1024 * 1024,
    modulePreload: false,
    chunkSizeWarningLimit: 16384,
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (asset) => {
          const name = asset.names?.[0] ?? asset.name ?? ''
          return name.toLowerCase().endsWith('.css') ? 'app.css' : 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
