import { FLAG_FINAL, decodeFrame } from './frames';
import { createSink, type Sink, type SinkMeta } from './sink';
import { wsUrl } from './servers';

export type DownloadPhase =
  | 'awaiting-host'
  | 'joined'
  | 'queued'
  | 'receiving'
  | 'done'
  | 'declined'
  | 'error';

export type DownloadState = {
  phase: DownloadPhase;
  position?: number;
  etaLow?: number;
  etaHigh?: number;
  receivedBytes: number;
  totalBytes: number;
  message?: string;
};

const RECONNECT_DELAY_MS = 1200;
const ACK_EVERY = 8;

export async function claimSession(
  server: string,
  id: string,
  key: string,
): Promise<{ token: string; meta: SinkMeta }> {
  const res = await fetch(`${server}/sessions/${id.toUpperCase()}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((body as { error?: string }).error || "No such transfer, or the password didn't work."));
  }
  return body as { token: string; meta: SinkMeta };
}

export class DownloadController {
  #ws: WebSocket | null = null;
  #sink: Sink | null = null;
  #chain: Promise<void> = Promise.resolve();
  #nextSeq = 0;
  #received = 0;
  #pendingAcks = 0;
  #closed = false;
  #retried = false;
  #state: DownloadState;

  constructor(
    private readonly server: string,
    readonly id: string,
    private readonly token: string,
    readonly meta: SinkMeta,
    private readonly onState: (state: DownloadState) => void,
  ) {
    this.#state = { phase: 'awaiting-host', receivedBytes: 0, totalBytes: meta.size };
  }

  get state(): DownloadState {
    return this.#state;
  }

  get writtenBytes(): number {
    return this.#received;
  }

  connect(): void {
    const url = wsUrl(
      this.server,
      `/sessions/${this.id}/ws?role=download&token=${encodeURIComponent(this.token)}`,
    );
    const ws = new WebSocket(url);
    this.#ws = ws;
    ws.binaryType = 'arraybuffer';

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.#onControl(event.data);
        return;
      }
      const buffer = event.data as ArrayBuffer;
      // Serialized so an out-of-order or slow write cannot interleave.
      this.#chain = this.#chain
        .then(() => this.#onChunk(new Uint8Array(buffer)))
        .catch((error: unknown) => this.#fail(error instanceof Error ? error.message : 'Write failed.'));
    };

    ws.onclose = () => {
      if (this.#closed || this.#state.phase === 'done') return;
      if (this.#retried) {
        this.#fail('The connection dropped.');
        return;
      }
      this.#retried = true;
      setTimeout(() => {
        if (!this.#closed && this.#state.phase !== 'done') this.connect();
      }, RECONNECT_DELAY_MS);
    };
  }

  // Opens the destination first, then agrees to receive. A picker is shown at
  // the moment bytes are about to arrive, not minutes earlier.
  async start(): Promise<void> {
    if (this.#sink) return;
    this.#sink = await createSink(this.meta);
    this.#emit({ phase: 'queued', position: this.#state.position ?? 1 });
    this.#send({ type: 'confirm' });
  }

  cancel(): void {
    this.#closed = true;
    this.#send({ type: 'cancel' });
    void this.#sink?.abort();
    try {
      this.#ws?.close();
    } catch {
      // already closed
    }
  }

  #onControl(raw: string) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    switch (message.type) {
      case 'joined':
        this.#emit({ phase: 'joined' });
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
        this.#emit({ phase: 'receiving' });
        if (this.#nextSeq > 0) this.#send({ type: 'resume', from: this.#nextSeq });
        break;
      case 'resume':
        if (this.#nextSeq > 0) this.#send({ type: 'resume', from: this.#nextSeq });
        break;
      case 'declined':
        this.#closed = true;
        this.#emit({ phase: 'declined' });
        break;
      case 'done':
        void this.#finish();
        break;
      case 'error':
        this.#fail(codeMessage(String(message.code || 'error')));
        break;
      default:
        break;
    }
  }

  async #onChunk(frame: Uint8Array) {
    if (this.#closed) return;

    let decoded: { seq: number; flags: number; payload: Uint8Array };
    try {
      decoded = decodeFrame(frame);
    } catch {
      this.#fail('A chunk arrived corrupted.');
      return;
    }

    if (decoded.seq !== this.#nextSeq) {
      // We cannot write ahead of ourselves, so ask for the gap instead of
      // silently dropping bytes.
      this.#send({ type: 'resume', from: this.#nextSeq });
      return;
    }

    if (!this.#sink) {
      this.#fail('No destination was opened.');
      return;
    }

    await this.#sink.write(decoded.seq, decoded.payload);
    this.#nextSeq += 1;
    this.#received += decoded.payload.byteLength;
    this.#pendingAcks += 1;

    this.#emit({ phase: 'receiving', receivedBytes: this.#received });

    if (this.#pendingAcks >= ACK_EVERY || (decoded.flags & FLAG_FINAL) === FLAG_FINAL) {
      this.#ack();
    }
  }

  #ack() {
    this.#pendingAcks = 0;
    this.#send({ type: 'ack', seq: this.#nextSeq - 1, received: this.#received });
  }

  async #finish() {
    if (this.#closed) return;
    this.#closed = true;
    try {
      await this.#sink?.close();
    } catch (error) {
      this.#emit({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Could not finish the file.',
      });
      return;
    }
    this.#emit({ phase: 'done', receivedBytes: this.#received, totalBytes: this.meta.size });
  }

  #emit(patch: Partial<DownloadState>) {
    this.#state = {
      ...this.#state,
      receivedBytes: patch.receivedBytes ?? this.#state.receivedBytes,
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
    case 'expired':
      return 'The transfer expired before it started.';
    case 'uploader-left':
      return 'The sender closed the transfer.';
    case 'restart':
      return 'That server is restarting. Ask for a new id.';
    case 'too-many-attempts':
      return 'Too many wrong passwords: this transfer was destroyed.';
    case 'done':
      return '';
    default:
      return 'The transfer stopped.';
  }
}
