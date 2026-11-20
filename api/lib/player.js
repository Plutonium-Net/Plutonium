import { verifyToken } from './token.js';

// Local development only: lets a socket or route authenticate with "dev:alice"
// instead of a real Firebase ID token. Never set this variable in production.
export const DEV_AUTH_FLAG = 'PLAYABLES_DEV_AUTH';

export async function playerFromRequest(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  return playerFromToken(header.slice(7).trim(), env);
}

export async function playerFromToken(token, env) {
  if (!token) return null;

  if (env[DEV_AUTH_FLAG] === '1' && token.startsWith('dev:')) {
    const handle = (token.slice(4).trim().slice(0, 24) || 'guest').toLowerCase();
    return { uid: `dev:${handle}`, name: handle, dev: true };
  }

  const user = await verifyToken(token, env);
  if (!user) return null;

  const name = user.name || (user.email ? user.email.split('@')[0] : '') || 'Player';
  return { uid: user.uid, name: name.slice(0, 24) };
}
