/**
 * Remote browser routes: /net/session, /net/sessions.
 *
 * Ported from cf-worker/net-worker with behaviour deliberately unchanged: no
 * authentication and no rate limit. That is a known weakness, not an oversight
 * — adding auth here would change what the browser feature does, so it stays a
 * separate decision. See api-merge-checklist.html, section 9.
 */

import { json, fail } from '../lib/responses.js';

export async function handle(request, env, url, path) {
  if (path === '/session' && request.method === 'POST') {
    return handleCreate(request, env);
  }

  if (path === '/session' && request.method === 'DELETE') {
    return handleDelete(request, env);
  }

  if (path === '/sessions' && request.method === 'DELETE') {
    return handleDeleteAll(env);
  }

  return fail('Not found', 404);
}

function isValidUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

async function handleCreate(request, env) {
  if (!env.HYPERBEAM_API_KEY) return fail('HYPERBEAM_API_KEY not configured', 500);

  const body = await request.json().catch(() => null);
  if (!body) return fail('Invalid JSON', 400);

  const { url } = body;
  if (!url || !isValidUrl(url)) return fail('A valid url is required', 400);

  const res = await fetch('https://engine.hyperbeam.com/v0/vm', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}`,
    },
    body: JSON.stringify({
      start_url: url,
      kiosk:     true,
      ublock:    true,
      timeout:   { offline: 300 },
    }),
  });

  const data = await res.json();
  if (!res.ok) return fail(data.message || 'Remote engine error', res.status);

  return json({ session_id: data.session_id, embed_url: data.embed_url });
}

async function handleDelete(request, env) {
  if (!env.HYPERBEAM_API_KEY) return fail('HYPERBEAM_API_KEY not configured', 500);

  const body = await request.json().catch(() => null);
  if (!body?.session_id) return fail('session_id required', 400);

  const res = await fetch(`https://engine.hyperbeam.com/v0/vm/${body.session_id}`, {
    method:  'DELETE',
    headers: { 'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}` },
  });

  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    return fail(data.message || 'Remote engine error', res.status);
  }

  return json({ deleted: true });
}

async function handleDeleteAll(env) {
  if (!env.HYPERBEAM_API_KEY) return fail('HYPERBEAM_API_KEY not configured', 500);

  const ids = [];
  let cursor = null;

  do {
    const listUrl = 'https://engine.hyperbeam.com/v0/vm' + (cursor ? `?after=${cursor}` : '');
    const listRes = await fetch(listUrl, {
      headers: { 'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}` },
    });

    if (!listRes.ok) {
      const data = await listRes.json().catch(() => ({}));
      return fail(data.message || 'Failed to list sessions', listRes.status);
    }

    const body = await listRes.json().catch(() => ({}));
    const page = Array.isArray(body) ? body : (body.results || []);
    page.forEach(vm => ids.push(vm.id || vm.session_id));
    cursor = body.next && body.next !== cursor ? body.next : null;
  } while (cursor);

  const results = await Promise.all(ids.map(async id => {
    const res = await fetch(`https://engine.hyperbeam.com/v0/vm/${id}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${env.HYPERBEAM_API_KEY}` },
    });
    return { id, deleted: res.ok || res.status === 404 };
  }));

  return json({ deleted: results.length, sessions: results });
}
