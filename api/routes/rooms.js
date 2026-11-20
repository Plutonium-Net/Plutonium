import { fail, json, unauthorized } from '../lib/responses.js';
import { playerFromRequest } from '../lib/player.js';
import { checkRateLimit } from '../lib/ratelimit.js';

// Stateless half of rooms: authenticate, rate limit, choose a code, then hand
// the request to that room's Durable Object. No game state lives here.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
const MAX_ROOMS = 20;
const WINDOW_SECS = 3600;
const INTERNAL = 'https://room.internal';

export async function handle(request, env, url, path) {
  if (!env.GAME_ROOM) return fail('Rooms are not configured', 503);

  if (path === '/create' && request.method === 'POST') return createRoom(request, env);

  const [rawCode, action] = path.replace(/^\//, '').split('/');
  const code = String(rawCode || '').toUpperCase();
  if (!CODE_RE.test(code)) return fail('Not found', 404);

  const room = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(`chess:${code}`));

  if (action === 'ws') {
    if (request.headers.get('Upgrade') !== 'websocket') return fail('Expected a websocket upgrade', 426);
    return room.fetch(request);
  }
  if (action) return fail('Not found', 404);

  // Reading a board is players-only too; the code alone is not a credential.
  if (!(await playerFromRequest(request, env))) return unauthorized();

  const res = await room.fetch(`${INTERNAL}/rooms/${code}`);
  const body = await res.json().catch(() => null);
  return res.ok ? json(body, 200, { 'Cache-Control': 'no-store' }) : fail(body?.error || 'Room not found', res.status);
}

async function createRoom(request, env) {
  const player = await playerFromRequest(request, env);
  if (!player) return unauthorized();

  const limit = await checkRateLimit(env, {
    scope: 'rooms',
    uid: player.uid,
    max: MAX_ROOMS,
    windowSecs: WINDOW_SECS,
  });

  if (limit.limited) {
    const retryAfter = Math.max(0, (limit.reset || Date.now() / 1000 + WINDOW_SECS) - Math.floor(Date.now() / 1000));
    return json(
      { error: `Rate limit exceeded - you can open ${MAX_ROOMS} rooms an hour.`, retry_after: retryAfter },
      429,
      { 'Retry-After': String(retryAfter) }
    );
  }

  const code = randomCode();
  const res = await env.GAME_ROOM.get(env.GAME_ROOM.idFromName(`chess:${code}`)).fetch(`${INTERNAL}/rooms/${code}/create`, {
    method: 'POST',
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return fail(body?.error || 'Could not create room', res.status);

  return json({ code, room: body }, 201, { 'Cache-Control': 'no-store' });
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}
