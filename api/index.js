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

import { preflight, fail, html, json } from './lib/responses.js';
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

      // Health probe, and what the landing page's status card reads. Each entry
      // is a presence check on the bindings that route group needs — no calls
      // out to a provider, and no values leave the worker.
      if (path === '/healthz') return healthz(env);

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

function healthz(env) {
  const has = name => Boolean(env[name]);
  const components = [
    { name: 'API',        ok: true },
    { name: 'Rate limit', ok: has('PLU_RATE_LIMIT') },
    { name: 'Firebase',   ok: has('FIREBASE_API_KEY') && has('FIREBASE_PROJECT_ID') && has('FIREBASE_DATABASE_URL') },
    { name: 'OAuth',      ok: has('GITHUB_CLIENT_ID') && has('GITHUB_CLIENT_SECRET') && has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET') && has('SITE_URL') },
    { name: 'AI',         ok: has('GROQ_API_KEY') },
    { name: 'Sessions',   ok: has('HYPERBEAM_API_KEY') },
  ];
  const ok = components.every(c => c.ok);

  return json(
    { status: ok ? 'ok' : 'degraded', service: 'plutonium-api', time: new Date().toISOString(), components },
    ok ? 200 : 503,
    { 'Cache-Control': 'no-store' },
  );
}

/** Collapse repeated slashes and drop a trailing one, so /ai/chat/ === /ai/chat. */
function normalizePath(pathname) {
  const collapsed = String(pathname).replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return collapsed || '/';
}
