// The session password. The server never sees it: this derives a 32-byte key
// from the password and the session id, and only that key crosses the wire.

export const MIN_LENGTH = 3;
export const MAX_LENGTH = 128;
export const ITERATIONS = 600_000;
const SALT_PREFIX = 'plu-drop/session/v1:';

// Deliberately short. A twelve-character floor is the real defense; this list
// only catches the handful people still type on purpose.
const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'letmein', 'welcome',
  'qwerty', 'qwertyuiop', 'qwerty123', 'iloveyou', 'admin', 'admin123',
  'monkey', 'dragon', 'sunshine', 'princess', 'football', 'baseball',
  'abc123', 'abcd1234', 'trustno1', 'starwars', 'whatever', 'computer',
  'superman', 'batman', 'master', 'shadow', 'michael', 'jennifer',
  'changeme', 'secret', 'hello123', 'freedom', 'ninja', 'mustang',
  'access', 'flower', 'cookie', 'orange', 'purple', 'banana',
  'plutonium', 'dropbox', 'download', 'transfer', 'filetransfer',
]);

export function normalizeSecret(input: string): string {
  return input.normalize('NFKC');
}

export function policyError(password: string, id: string): string | null {
  const value = normalizeSecret(password);
  const length = [...value].length;

  if (length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
  if (length > MAX_LENGTH) return `Keep it under ${MAX_LENGTH} characters.`;

  const lower = value.toLowerCase();
  const idLower = id.toLowerCase().replace(/-/g, '');
  if (idLower && lower.includes(idLower)) return 'Do not put the id in the password.';
  if (lower === idLower) return 'Do not use the id as the password.';
  if (COMMON.has(lower)) return 'That password is on every list. Pick another.';
  if (/^(.)\1+$/.test(value)) return 'That is one character repeated.';
  if (isRun(lower)) return 'That is a keyboard run, not a password.';

  return null;
}

function isRun(value: string): boolean {
  if (value.length < 3) return false;
  let step = 0;
  for (let i = 1; i < value.length; i++) {
    const delta = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (delta !== 1 && delta !== -1) return false;
    if (step && delta !== step) return false;
    step = delta;
  }
  return true;
}

// Runs on WebCrypto's native implementation, which is off the main thread, so
// 600k iterations does not freeze the shell.
export async function deriveKey(password: string, id: string): Promise<string> {
  const secret = normalizeSecret(password);
  const salt = new TextEncoder().encode(`${SALT_PREFIX}${id.toUpperCase()}`);
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    256,
  );
  return toBase64Url(new Uint8Array(bits));
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function formatIdInput(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, '')
    .slice(0, 6);
}

export function groupId(id: string): string {
  return id.length === 6 ? `${id.slice(0, 3)}-${id.slice(3)}` : id;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value >= 100 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'any moment';
  if (seconds < 60) return `about ${Math.max(1, Math.round(seconds))}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `about ${hours}h ${minutes % 60}m`;
}
