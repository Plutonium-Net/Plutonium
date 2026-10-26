/**
 * Firebase ID token verification.
 *
 * The workers this replaces only checked that an `Authorization` header started
 * with "Bearer " (see groq-worker, vm-worker). That let anyone mint their own
 * quota by sending `Bearer anything`. This module actually validates the JWT:
 *
 *   - signature against Google's rotating RSA public keys for the
 *     `securetoken@system.gserviceaccount.com` service account
 *   - `aud` === Firebase project id
 *   - `iss` === https://securetoken.google.com/<project id>
 *   - `exp` / `iat` sanity, and a non-empty `sub` (the Firebase uid)
 *
 * Keys are cached per isolate for as long as Google's Cache-Control allows, so
 * the steady-state cost of verification is one WebCrypto verify.
 */

const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SECS = 60;

let keyCache = { keys: null, expiresAt: 0 };
let inFlight = null;

/**
 * Read and verify the bearer token on a request.
 * @returns {Promise<{uid: string, email: string, name: string, picture: string, exp: number}|null>}
 */
export async function verifyIdToken(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  return verifyToken(token, env);
}

/** Verify a raw JWT string. Exported so it can be exercised directly. */
export async function verifyToken(token, env) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;

  let header;
  let payload;
  try {
    header = JSON.parse(b64urlDecode(parts[0]));
    payload = JSON.parse(b64urlDecode(parts[1]));
  } catch (_) {
    return null;
  }

  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload?.exp !== 'number' || payload.exp <= now) return null;
  if (typeof payload?.iat !== 'number' || payload.iat > now + CLOCK_SKEW_SECS) return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;

  const jwk = await getKey(header.kid);
  if (!jwk) return null;

  let cryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  } catch (_) {
    return null;
  }

  let signature;
  try {
    signature = b64urlToBytes(parts[2]);
  } catch (_) {
    return null;
  }

  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signed);
  if (!valid) return null;

  return {
    uid:     payload.sub,
    email:   typeof payload.email === 'string' ? payload.email : '',
    name:    typeof payload.name === 'string' ? payload.name : '',
    picture: typeof payload.picture === 'string' ? payload.picture : '',
    exp:     payload.exp,
  };
}

async function getKey(kid) {
  if (keyCache.keys && keyCache.expiresAt > Date.now()) {
    const hit = keyCache.keys[kid];
    if (hit) return hit;
  }
  await refreshKeys();
  return (keyCache.keys && keyCache.keys[kid]) || null;
}

async function refreshKeys() {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const res = await fetch(JWK_URL, { cf: { cacheTtl: 3600 } });
    if (!res.ok) return;

    const body = await res.json();
    const keys = {};
    for (const jwk of body.keys || []) {
      if (jwk && typeof jwk.kid === 'string') keys[jwk.kid] = jwk;
    }

    // Never hold keys longer than Google says, and never shorter than a minute.
    let ttlMs = DEFAULT_TTL_MS;
    const cacheControl = res.headers.get('Cache-Control') || '';
    const maxAge = cacheControl.match(/max-age=(\d+)/i);
    if (maxAge) {
      const secs = parseInt(maxAge[1], 10);
      if (Number.isFinite(secs) && secs > 0) {
        ttlMs = Math.min(Math.max(secs, 60) * 1000, DEFAULT_TTL_MS);
      }
    }

    keyCache = { keys, expiresAt: Date.now() + ttlMs };
  })()
    .catch(() => {})
    .finally(() => { inFlight = null; });

  return inFlight;
}

/** Test seam: forget cached keys. */
export function resetKeyCache() {
  keyCache = { keys: null, expiresAt: 0 };
  inFlight = null;
}

function pad(b64) {
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4);
}

function b64urlToBytes(str) {
  const normalized = pad(str.replace(/-/g, '+').replace(/_/g, '/'));
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64urlDecode(str) {
  return new TextDecoder().decode(b64urlToBytes(str));
}
