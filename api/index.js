import { preflight, fail, html, json } from './lib/responses.js';
import { landingPage } from './lib/landing.js';
import * as gateway from './routes/gateway.js';
import * as ai from './routes/ai.js';
import * as vm from './routes/vm.js';
import * as net from './routes/net.js';
import * as rooms from './routes/rooms.js';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return preflight();

    const url  = new URL(request.url);
    const path = normalizePath(url.pathname);

    try {
      if (path === '/') return html(landingPage());

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

      if (path === '/rooms' || path.startsWith('/rooms/')) {
        return await rooms.handle(request, env, url, path.slice(6) || '/');
      }

      return fail('Not found', 404);
    } catch (err) {
      console.error('[api]', err);
      return fail('Internal error', 500);
    }
  },
};

// Durable Object class, exported from the entrypoint as wrangler requires.
export { GameRoom } from './game-room.js';

function healthz(env) {
  const has = name => Boolean(env[name]);
  const components = [
    { name: 'API',        ok: true },
    { name: 'Rate limit', ok: has('PLU_RATE_LIMIT') },
    { name: 'Firebase',   ok: has('FIREBASE_API_KEY') && has('FIREBASE_PROJECT_ID') && has('FIREBASE_DATABASE_URL') },
    { name: 'OAuth',      ok: has('GITHUB_CLIENT_ID') && has('GITHUB_CLIENT_SECRET') && has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET') && has('SITE_URL') },
    { name: 'AI',         ok: has('GROQ_API_KEY') },
    { name: 'Sessions',   ok: has('HYPERBEAM_API_KEY') },
    { name: 'Rooms',      ok: has('GAME_ROOM') },
  ];
  const ok = components.every(c => c.ok);

  return json(
    { status: ok ? 'ok' : 'degraded', service: 'plutonium-api', time: new Date().toISOString(), components },
    ok ? 200 : 503,
    { 'Cache-Control': 'no-store' },
  );
}

function normalizePath(pathname) {
  const collapsed = String(pathname).replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return collapsed || '/';
}
