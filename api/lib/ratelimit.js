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
  }

  return { limited: false, remaining: Math.max(0, max - bucket.count), reset: bucket.reset, configured: true };
}

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
