import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { commitSha } from './scripts/build-info.mjs'

/**
 * Scramjet V2 reaches the relay through libcurl, whose wasm build wants
 * SharedArrayBuffer, and that only exists on a cross-origin isolated page, so
 * COOP/COEP would be the obvious headers to send here.
 *
 * They cannot be sent, though. COEP also refuses to embed any document that does
 * not send COEP itself, and every proxied page arrives without it, so the whole
 * page frame is refused with `net::ERR_BLOCKED_BY_RESPONSE` and proxied pages
 * render blank. A working proxy for every other engine beats V2's wasm path, so
 * isolation stays off. Turn it back on only alongside an engine that can attach
 * COEP to its own responses.
 */
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'unsafe-none',
  'Cross-Origin-Embedder-Policy': 'unsafe-none',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The build stamp on the home screen; the value is this build's commit.
  define: { __PLU_COMMIT__: JSON.stringify(commitSha()) },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
})
