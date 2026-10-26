/**
 * VM routes: /vm/session, /vm/stats.
 *
 * Ported from cf-worker/vm-worker. Create is limited to two sessions per 15
 * minutes per verified uid; deletes are never limited. The Bearer token is now
 * actually verified, so the quota can no longer be reset by inventing one.
 */

import { json, fail, unauthorized } from '../lib/responses.js';
import { verifyIdToken } from '../lib/token.js';
import { checkRateLimit } from '../lib/ratelimit.js';

const MAX_CREATES = 2;
const WINDOW_SECS = 900;

export async function handle(request, env, url, path) {
  if (path === '/stats' && request.method === 'GET') {
    return json({
      rate_limit: {
        max_creates:  MAX_CREATES,
        window_secs:  WINDOW_SECS,
        window_label: '15 minutes',
      },
      hyperbeam_configured: !!env.HYPERBEAM_API_KEY,
    });
  }

  if (path === '/session' && request.method === 'POST') {
    return handleSession(request, env);
  }

  return fail('Not found', 404);
}

async function handleSession(request, env) {
  if (!env.HYPERBEAM_API_KEY) return fail('HYPERBEAM_API_KEY not configured', 500);

  const user = await verifyIdToken(request, env);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const { action, session_id } = body;

  if (action === 'create') {
    const rl = await checkRateLimit(env, {
      scope: 'vm',
      uid:   user.uid,
      max:   MAX_CREATES,
      windowSecs: WINDOW_SECS,
    });

    if (rl.limited) {
      const retryAfter = rl.reset ? Math.max(0, rl.reset - Math.floor(Date.now() / 1000)) : WINDOW_SECS;
      return json(
        {
          error:       `Rate limit exceeded - you can start ${MAX_CREATES} sessions every 15 minutes.`,
          retry_after: retryAfter,
        },
        429,
        { 'Retry-After': String(retryAfter) }
      );
    }

    const res = await fetch('https://engine.hyperbeam.com/v0/vm', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}`,
      },
      body: JSON.stringify({
        offline_timeout: 60,
        start_url:       'https://www.google.com',
      }),
    });

    const data = await res.json();
    if (!res.ok) return fail(data.message || 'Remote engine error', res.status);

    return json({ session_id: data.session_id, embed_url: data.embed_url });
  }

  if (action === 'delete') {
    if (!session_id) return fail('session_id required', 400);

    const res = await fetch(`https://engine.hyperbeam.com/v0/vm/${session_id}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}` },
    });

    if (!res.ok && res.status !== 404) {
      const data = await res.json().catch(() => ({}));
      return fail(data.message || 'Remote engine error', res.status);
    }

    return json({ deleted: true });
  }

  return fail('Unknown action', 400);
}
