import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// Scramjet V2 reaches the relay through libcurl, whose wasm build needs
// SharedArrayBuffer. That only exists on a cross-origin isolated page, so the
// dev server has to send COOP/COEP. `credentialless` rather than `require-corp`
// keeps the cross-origin host-proxy frames (Compaxy, RH) loadable.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
})
