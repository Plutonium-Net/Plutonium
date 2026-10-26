/**
 * Shared, KV-backed fixed-window rate limiter.
 *
 * One namespace (PLU_RATE_LIMIT) serves every scope; keys are namespaced with
 * `<scope>:<uid>`. Raises and limits are supplied by the caller so the policy
 * lives next to the route that owns it:
 *
 *   ai  — 100 messages per 12 hours  (unchanged from groq-worker)
 *   vm  — 2 session creates per 15 minutes (unchanged from vm-worker)
 *
 * KV is eventually consistent, so this is a speed bump rather than an exact
 * quota: a burst of concurrent requests can overshoot by a few. It is still a
 * far stronger guarantee than the previous per-token-string keying, which any
 * caller could reset by inventing a new token.
 */

export async function checkRateLimit(env, { scope, uid, max, windowSecs }) {
  const kv = env.PLU_RATE_LIMIT;
  if (!kv) return { limited: false, remaining: null, reset: null, configured: false };

  const key = `${scope}:${uid}`;
  const now = Math.floor(Date.now() / 1000);
  const bucket = await readBucket(kv, key, now, windowSecs);

  if (bucket.count >= max) {
    return { limited: true, remaining: 0, reset: bucket.reset, configured: true };
  }

  bucket.count += 1;

  try {
    await kv.put(key, JSON.stringify(bucket), {
      expirationTtl: Math.max(60, bucket.reset - now + 10),
    });
  } catch (_) {
    // A failed write must not fail the request it was protecting.
  }

  return { limited: false, remaining: Math.max(0, max - bucket.count), reset: bucket.reset, configured: true };
}

/** Read the current window without consuming a slot. */
export async function peekRateLimit(env, { scope, uid, max, windowSecs }) {
  const kv = env.PLU_RATE_LIMIT;
  const now = Math.floor(Date.now() / 1000);
  if (!kv) return { used: 0, remaining: max, max, reset: now + windowSecs, configured: false };

  const bucket = await readBucket(kv, `${scope}:${uid}`, now, windowSecs);
  return {
    used:      bucket.count,
    remaining: Math.max(0, max - bucket.count),
    max,
    reset:     bucket.reset,
    configured: true,
  };
}

async function readBucket(kv, key, now, windowSecs) {
  let bucket = null;
  try {
    const raw = await kv.get(key);
    bucket = raw ? JSON.parse(raw) : null;
  } catch (_) {
    bucket = null;
  }

  const valid =
    bucket &&
    typeof bucket.count === 'number' &&
    typeof bucket.reset === 'number' &&
    now < bucket.reset;

  if (!valid) return { count: 0, reset: now + windowSecs };
  return { count: bucket.count, reset: bucket.reset };
}
