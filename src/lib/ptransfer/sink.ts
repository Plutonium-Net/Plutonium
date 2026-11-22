import { CHUNK_SIZE } from './frames';

// The destination is chosen at confirmation, not at claim: making someone stare
// at a file picker while their slot is still queued is worse than asking at the
// moment the bytes start.

export type Sink = {
  write(seq: number, bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
};

export type SinkMeta = { name: string; size: number; type: string };

type WritableLike = {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
};

type HandleLike = {
  createWritable(options?: { keepExistingData?: boolean }): Promise<WritableLike>;
  getFile(): Promise<File>;
};

type PickerOptions = { suggestedName?: string; types?: { description: string; accept: Record<string, string[]> }[] };

const OPEN_MEMORY_LIMIT = 512 * 1024 * 1024;

export function sinkSupport(): 'picker' | 'opfs' | 'memory' {
  const w = window as unknown as { showSaveFilePicker?: unknown };
  if (typeof w.showSaveFilePicker === 'function') return 'picker';
  if (typeof navigator !== 'undefined' && typeof navigator.storage.getDirectory === 'function') return 'opfs';
  return 'memory';
}

export async function createSink(meta: SinkMeta): Promise<Sink> {
  const support = sinkSupport();

  if (support === 'picker') {
    try {
      return await pickerSink(meta);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      // No chosen file: fall back to the disk-backed path rather than failing.
    }
  }

  if (support !== 'memory') return opfsSink(meta);

  if (meta.size > OPEN_MEMORY_LIMIT) {
    throw new Error('This browser cannot stream to disk. Use Chrome, Edge, Firefox 111+ or Safari 15.2+.');
  }
  return memorySink(meta);
}

async function pickerSink(meta: SinkMeta): Promise<Sink> {
  const picker = (
    window as unknown as { showSaveFilePicker: (options: PickerOptions) => Promise<HandleLike> }
  ).showSaveFilePicker;

  const handle = await picker({
    suggestedName: meta.name,
    types: [{ description: 'File', accept: { 'application/octet-stream': [extensionOf(meta.name)] } }],
  });
  const writable = await handle.createWritable();

  return {
    async write(_seq, bytes) {
      await writable.write(bytes);
    },
    async close() {
      await writable.close();
    },
    async abort() {
      try {
        await writable.abort();
      } catch {
        // Already closed.
      }
    },
  };
}

// Firefox and Safari have no picker, but they do have OPFS with a synchronous
// access handle — in a worker only. That is the disk-backed path for them.
const OPFS_WORKER = `
let access = null;
self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'open') {
      access = await msg.handle.createSyncAccessHandle();
      self.postMessage({ type: 'opened' });
      return;
    }
    if (msg.type === 'write') {
      access.write(new Uint8Array(msg.bytes), { at: msg.at });
      self.postMessage({ type: 'written', id: msg.id });
      return;
    }
    if (msg.type === 'close') {
      access.truncate(msg.size);
      access.flush();
      access.close();
      access = null;
      self.postMessage({ type: 'closed' });
    }
  } catch (error) {
    self.postMessage({ type: 'failed', message: String((error && error.message) || error) });
  }
};
`;

async function opfsSink(meta: SinkMeta): Promise<Sink> {
  const root = await navigator.storage.getDirectory();
  const safeName = `drop-${Date.now()}-${meta.name.replace(/[^\w.\-]/g, '_')}`;
  const handle = (await root.getFileHandle(safeName, { create: true })) as unknown as HandleLike;

  const worker = new Worker(URL.createObjectURL(new Blob([OPFS_WORKER], { type: 'text/javascript' })));

  const writes = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
  const listeners = new Map<string, (msg: { message?: string }) => void>();

  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data as { type: string; id?: number; message?: string };

    if (msg.type === 'written' && typeof msg.id === 'number') {
      const entry = writes.get(msg.id);
      writes.delete(msg.id);
      entry?.resolve();
      return;
    }

    if (msg.type === 'failed') {
      const error = new Error(msg.message || 'The browser refused the write.');
      for (const entry of writes.values()) entry.reject(error);
      writes.clear();
      listeners.get('failed')?.(msg);
      return;
    }

    listeners.get(msg.type)?.(msg);
  };

  const once = (type: string, timeoutMs = 15_000) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(type);
        reject(new Error(`Timed out waiting for the browser to ${type === 'opened' ? 'open the file' : 'finish writing'}.`));
      }, timeoutMs);
      listeners.set(type, () => {
        clearTimeout(timer);
        listeners.delete(type);
        resolve();
      });
    });

  const opened = once('opened');
  worker.postMessage({ type: 'open', handle });
  await opened;

  let highestByte = 0;
  return {
    async write(seq, bytes) {
      const copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      const id = seq + 1;
      const written = new Promise<void>((resolve, reject) => {
        writes.set(id, { resolve, reject });
      });
      worker.postMessage({ type: 'write', id, at: seq * CHUNK_SIZE, bytes: copy.buffer }, [copy.buffer]);
      await written;
      highestByte = Math.max(highestByte, seq * CHUNK_SIZE + bytes.length);
    },
    async close() {
      const closed = once('closed', 30_000);
      worker.postMessage({ type: 'close', size: Math.max(highestByte, meta.size) });
      await closed;
      worker.terminate();
      triggerDownload(await handle.getFile(), meta.name);
    },
    async abort() {
      worker.terminate();
    },
  };
}

function memorySink(meta: SinkMeta): Sink {
  const parts: Uint8Array[] = [];
  return {
    async write(_seq, bytes) {
      parts.push(new Uint8Array(bytes));
    },
    async close() {
      triggerDownload(new Blob(parts as BlobPart[], { type: meta.type }), meta.name);
      parts.length = 0;
    },
    async abort() {
      parts.length = 0;
    },
  };
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index) : '.bin';
}
