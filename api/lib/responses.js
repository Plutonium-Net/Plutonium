/**
 * Shared response helpers.
 *
 * The API is served from api.plutoniumnet.work while the site itself is hosted
 * elsewhere, so every response is cross-origin. The policy is intentionally
 * open (`*`) exactly as the four workers it replaces were.
 */

const CORS_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const CORS_HEADERS = 'Content-Type, Authorization, X-Groq-Key';

export function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': CORS_METHODS,
    'Access-Control-Allow-Headers': CORS_HEADERS,
    'Access-Control-Max-Age':       '86400',
    ...extra,
  };
}

export function preflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function json(body, status = 200, extra = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: corsHeaders({ 'Content-Type': 'application/json', ...extra }),
  });
}

export function fail(message, status = 400, extra = {}) {
  return json({ error: message, ...extra }, status);
}

export function unauthorized() {
  return fail('Unauthorized', 401);
}

export function html(body) {
  return new Response(body, {
    // no-cache, not no-store: the page stays cacheable but has to revalidate,
    // so a deploy is never hidden behind a stale copy in someone's browser.
    headers: corsHeaders({ 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-cache' }),
  });
}
