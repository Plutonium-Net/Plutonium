import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { commitSha } from './scripts/build-info.mjs'

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'unsafe-none',
  'Cross-Origin-Embedder-Policy': 'unsafe-none',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __PLU_COMMIT__: JSON.stringify(commitSha()) },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
})
