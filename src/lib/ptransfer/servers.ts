export type DropServerStatus = {
  url: string;
  label: string;
  host: string;
  online: boolean;
  active: number;
  queueDepth: number;
  bytesPerSec: number;
  version: string;
  latencyMs: number;
};

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const DEFAULT_SERVERS = [
  'https://pt-asia.plutoniumnet.work',
  'https://pt-europe.plutoniumnet.work',
  'https://pt-us-east-1.plutoniumnet.work',
  'https://pt-us-east-2.plutoniumnet.work',
  'https://pt-us-west.plutoniumnet.work',
];

export const DROP_SERVERS: string[] = String(env?.VITE_DROP_SERVERS || DEFAULT_SERVERS.join(','))
  .split(',')
  .map((value) => value.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Display names for the boxes we run. Anything else falls back to its host.
const NAMES: Record<string, string> = {
  'pt-asia.plutoniumnet.work': 'Asia',
  'pt-europe.plutoniumnet.work': 'Europe',
  'pt-us-east-1.plutoniumnet.work': 'US East 1',
  'pt-us-east-2.plutoniumnet.work': 'US East 2',
  'pt-us-west.plutoniumnet.work': 'US West',
};

export function serverHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export function serverLabel(url: string): string {
  const host = serverHost(url);
  return NAMES[host] ?? host;
}

export function wsUrl(server: string, path: string): string {
  const base = server.replace(/\/+$/, '');
  return `${base.replace(/^http/, 'ws')}${path}`;
}

// The picker shows real queue depths, so choosing a server is choosing a wait
// rather than waiting to find out.
export async function probeServer(url: string, timeoutMs = 2500): Promise<DropServerStatus> {
  const started = performance.now();
  const offline: DropServerStatus = {
    url,
    label: serverLabel(url),
    host: serverHost(url),
    online: false,
    active: 0,
    queueDepth: 0,
    bytesPerSec: 0,
    version: '',
    latencyMs: 0,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url}/status`, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) return { ...offline, latencyMs: Math.round(performance.now() - started) };
    const body = (await res.json()) as Partial<DropServerStatus>;
    return {
      url,
      label: serverLabel(url),
      host: serverHost(url),
      online: true,
      active: Number(body.active) || 0,
      queueDepth: Number(body.queueDepth) || 0,
      bytesPerSec: Number(body.bytesPerSec) || 0,
      version: String(body.version || ''),
      latencyMs: Math.round(performance.now() - started),
    };
  } catch {
    return { ...offline, latencyMs: Math.round(performance.now() - started) };
  }
}

export async function probeServers(): Promise<DropServerStatus[]> {
  const results = await Promise.all(DROP_SERVERS.map((url) => probeServer(url)));
  // Least busy first; offline servers sink. Ties keep config order.
  return results.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (a.queueDepth !== b.queueDepth) return a.queueDepth - b.queueDepth;
    if (a.active !== b.active) return a.active - b.active;
    return a.latencyMs - b.latencyMs;
  });
}
