/**
 * Plutonium API — one Worker replacing four:
 *
 *   accounting.cdn…  firebase-gateway  → /config, /auth/*, /firestore/*, /rtdb/*
 *   ai.cdn…          groq-worker       → /ai/*
 *   vm.cdn…          vm-worker         → /vm/*
 *   net.cdn…         net-worker        → /net/*
 *
 * Every route keeps the path it had inside its old worker; only the origin
 * changed, so the handlers ported with their logic intact.
 */

import { preflight, fail, html } from './lib/responses.js';
import { landingPage } from './lib/landing.js';
import * as gateway from './routes/gateway.js';
import * as ai from './routes/ai.js';
import * as vm from './routes/vm.js';
import * as net from './routes/net.js';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return preflight();

    const url  = new URL(request.url);
    const path = normalizePath(url.pathname);

    try {
      if (path === '/') return html(landingPage());

      if (
        path === '/config' ||
        path.startsWith('/auth/') ||
        path.startsWith('/firestore/') ||
        path.startsWith('/rtdb/')
      ) {
        return await gateway.handle(request, env, url, path);
      }

      if (path === '/ai' || path.startsWith('/ai/')) {
        return await ai.handle(request, env, url, path.slice(3) || '/');
      }

      if (path === '/vm' || path.startsWith('/vm/')) {
        return await vm.handle(request, env, url, path.slice(3) || '/');
      }

      if (path === '/net' || path.startsWith('/net/')) {
        return await net.handle(request, env, url, path.slice(4) || '/');
      }

      return fail('Not found', 404);
    } catch (err) {
      console.error('[api]', err);
      return fail('Internal error', 500);
    }
  },
};

/** Collapse repeated slashes and drop a trailing one, so /ai/chat/ === /ai/chat. */
function normalizePath(pathname) {
  const collapsed = String(pathname).replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return collapsed || '/';
}
