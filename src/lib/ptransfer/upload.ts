import { CHUNK_SIZE, FLAG_FINAL, SendWindow, encodeFrame } from './frames';
import { wsUrl } from './servers';

export type UploadPhase =
  | 'waiting'
  | 'claim'
  | 'awaiting-receiver'
  | 'queued'
  | 'sending'
  | 'done'
  | 'error';

export type UploadState = {
  phase: UploadPhase;
  position?: number;
  etaLow?: number;
  etaHigh?: number;
  sentBytes: number;
  confirmedBytes: number;
  totalBytes: number;
  message?: string;
};

const ACK_TIMEOUT_MS = 30_000;
const RECONNECT_DELAY_MS = 1200;

export type CreatedSession = { id: string; token: string };

export async function createSession(server: string, file: File, idToken: string): Promise<CreatedSession> {
  const res = await fetch(`${server}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      meta: {
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        lastModified: file.lastModified,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((body as { error?: string }).error || 'Could not open the transfer.'));
  return body as CreatedSession;
}

export async function submitVerifier(server: string, id: string, token: string, key: string): Promise<void> {
  const res = await fetch(`${server}/sessions/${id}/verifier`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(String((body as { error?: string }).error || 'Could not lock the transfer.'));
  }
}

export class UploadController {
  #ws: WebSocket | null = null;
  #window: SendWindow | null = null;
  #ackWaiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  #generation = 0;
  #retried = false;
  #closed = false;
  #state: UploadState;
  #file: File;

  constructor(
    private readonly server: string,
    readonly id: string,
    private readonly token: string,
    file: File,
    private readonly onState: (state: UploadState) => void,
  ) {
    this.#file = file;
    this.#state = {
      phase: 'waiting',
      sentBytes: 0,
      confirmedBytes: 0,
      totalBytes: file.size,
    };
  }

  get state(): UploadState {
    return this.#state;
  }

  connect(): void {
    const url = wsUrl(
      this.server,
      `/sessions/${this.id}/ws?role=upload&token=${encodeURIComponent(this.token)}`,
    );
    const ws = new WebSocket(url);
    this.#ws = ws;
    ws.binaryType = 'arraybuffer';

    ws.onmessage = (event) => this.#onMessage(event);

    ws.onclose = () => {
      if (this.#closed || this.#state.phase === 'done') return;
      if (this.#retried) {
        this.#fail('The connection dropped.');
        return;
      }
      this.#retried = true;
      this.#generation += 1;
      setTimeout(() => {
        if (!this.#closed && this.#state.phase !== 'done') this.connect();
      }, RECONNECT_DELAY_MS);
    };
  }

  confirm(): void {
    this.#send({ type: 'confirm' });
    this.#emit({ phase: 'awaiting-receiver' });
  }

  deny(): void {
    this.#send({ type: 'deny' });
    this.#emit({ phase: 'waiting' });
  }

  cancel(): void {
    this.#closed = true;
    this.#generation += 1;
    this.#send({ type: 'cancel' });
    try {
      this.#ws?.close();
    } catch {
      // already closed
    }
  }

  #onMessage(event: MessageEvent) {
    if (typeof event.data !== 'string') return;

    let message: Record<string, unknown>;
    try {
      message = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      return;
    }

    switch (message.type) {
      case 'waiting':
        this.#emit({ phase: 'waiting' });
        break;
      case 'claim':
        this.#emit({ phase: 'claim' });
        break;
      case 'awaiting-receiver':
        this.#emit({ phase: 'awaiting-receiver' });
        break;
      case 'queued':
        this.#emit({
          phase: 'queued',
          position: Number(message.position) || 1,
          etaLow: Number(message.etaLow) || 0,
          etaHigh: Number(message.etaHigh) || 0,
        });
        break;
      case 'ready':
        this.#start(Number(message.resumeFrom) || 0);
        break;
      case 'resume':
        this.#start(Number(message.from) || 0);
        break;
      case 'ack':
        this.#onAck(Number(message.seq));
        break;
      case 'done':
        this.#closed = true;
        this.#generation += 1;
        this.#emit({
          phase: 'done',
          sentBytes: this.#file.size,
          confirmedBytes: this.#file.size,
        });
        break;
      case 'error':
        this.#fail(codeMessage(String(message.code || 'error')));
        break;
      default:
        break;
    }
  }

  #onAck(seq: number) {
    const window = this.#window;
    if (!window || !Number.isInteger(seq)) return;
    window.ack(seq);
    this.#emitProgress();
    const waiters = this.#ackWaiters;
    this.#ackWaiters = [];
    for (const waiter of waiters) waiter.resolve();
  }

  #start(from: number) {
    if (this.#closed) return;
    this.#generation += 1;
    const window = this.#window ?? new SendWindow(this.#file.size);
    this.#window = window;
    window.rewind(from);
    this.#emit({ phase: 'sending' });
    void this.#run(this.#generation, window);
  }

  async #run(generation: number, window: SendWindow) {
    try {
      while (!this.#closed && generation === this.#generation) {
        if (window.done) break;

        if (!window.canSend()) {
          await this.#waitForAck(generation);
          continue;
        }

        const seq = window.take();
        if (seq < 0) break;

        const blob = this.#file.slice(window.offsetFor(seq), window.endFor(seq));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (generation !== this.#generation || this.#closed) return;

        const isFinal = seq === window.total - 1;
        const frame = encodeFrame(seq, bytes, isFinal ? FLAG_FINAL : 0);
        this.#ws?.send(frame);
        this.#emitProgress();
      }

      // Only declare the file sent once the receiver has written all of it.
      while (!this.#closed && generation === this.#generation && !window.done) {
        await this.#waitForAck(generation);
      }

      if (!this.#closed && generation === this.#generation) {
        this.#send({ type: 'done', bytes: this.#file.size });
      }
    } catch (error) {
      if (generation === this.#generation && !this.#closed) {
        this.#fail(error instanceof Error ? error.message : 'The transfer stopped.');
      }
    }
  }

  #waitForAck(generation: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#ackWaiters = this.#ackWaiters.filter((entry) => entry !== waiter);
        reject(new Error('The other side stopped acknowledging.'));
      }, ACK_TIMEOUT_MS);

      const waiter = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          reject(error);
        },
      };

      if (generation !== this.#generation || this.#closed) {
        clearTimeout(timer);
        reject(new Error('Connection replaced.'));
        return;
      }
      this.#ackWaiters.push(waiter);
    });
  }

  #emitProgress() {
    const window = this.#window;
    if (!window) return;
    this.#emit({
      sentBytes: Math.min(this.#file.size, window.sent * CHUNK_SIZE),
      confirmedBytes: Math.min(this.#file.size, Math.max(0, window.acked + 1) * CHUNK_SIZE),
    });
  }

  #emit(patch: Partial<UploadState>) {
    const total = this.#state.totalBytes;
    this.#state = {
      ...this.#state,
      sentBytes: patch.sentBytes ?? this.#state.sentBytes,
      confirmedBytes: Math.min(total, patch.confirmedBytes ?? this.#state.confirmedBytes),
      ...patch,
    };
    this.onState(this.#state);
  }

  #fail(message: string) {
    if (this.#state.phase === 'done') return;
    this.#closed = true;
    this.#emit({ phase: 'error', message });
  }

  #send(message: Record<string, unknown>) {
    try {
      this.#ws?.send(JSON.stringify(message));
    } catch {
      // a closed socket will surface through onclose
    }
  }
}

function codeMessage(code: string): string {
  switch (code) {
    case 'too-many-attempts':
      return 'Too many wrong passwords: this transfer was destroyed.';
    case 'expired':
      return 'The transfer expired.';
    case 'receiver-left':
      return 'The other side closed the window.';
    case 'restart':
      return 'That server is restarting. Start again on another one.';
    case 'done':
      return '';
    default:
      return 'The transfer stopped.';
  }
}
