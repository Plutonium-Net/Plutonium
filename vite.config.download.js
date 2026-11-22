import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { collectImages, collectRootImages, singleFile } from './build/single-file.mjs'
import { commitSha, history } from './scripts/build-info.mjs'


const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url))

export default defineConfig({
  publicDir: false,
  base: './',
  define: {
    __PLU_COMMIT__: JSON.stringify(commitSha()),
    __PLU_HISTORY__: JSON.stringify(history()),
    __PLU_SIZE__: JSON.stringify(process.env.PLU_SIZE || ''),
    __PLU_SVG_SIZE__: JSON.stringify(process.env.PLU_SVG_SIZE || ''),
    __PLU_XHTML_SIZE__: JSON.stringify(process.env.PLU_XHTML_SIZE || ''),
  },
  plugins: [
    react(),
    tailwindcss(),
    singleFile({ images: { ...collectRootImages(PUBLIC_DIR), ...collectImages(PUBLIC_DIR) } }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist-download-page',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 32 * 1024 * 1024,
    modulePreload: false,
    chunkSizeWarningLimit: 2048,
    rollupOptions: {
      input: fileURLToPath(new URL('./download.html', import.meta.url)),
    },
  },
})
