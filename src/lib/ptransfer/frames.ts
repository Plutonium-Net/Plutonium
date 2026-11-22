// MIRROR: ../ptransfer/src/frames.js. The two must encode identically; the 14-byte
// header below is the contract (seq, flags, reserved, 32-bit length, CRC32C).

export const CHUNK_SIZE = 256 * 1024;
export const HEADER_BYTES = 14;
export const MAX_FRAME_BYTES = CHUNK_SIZE + HEADER_BYTES;
export const FLAG_FINAL = 0x01;
export const WINDOW_LIMIT = 16;

const TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1;
  TABLE[i] = c >>> 0;
}

export function crc32c(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ TABLE[(crc ^ bytes[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function asView(payload: Uint8Array): Uint8Array {
  return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
}

// Returns an ArrayBuffer-backed view so it can be handed straight to
// WebSocket.send without a copy.
export function encodeFrame(seq: number, payload: Uint8Array, flags = 0): Uint8Array<ArrayBuffer> {
  const body = asView(payload);
  if (body.byteLength > CHUNK_SIZE) throw new Error('chunk-too-large');
  const out = new Uint8Array(HEADER_BYTES + body.byteLength);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, seq >>> 0);
  dv.setUint8(4, flags & 0xff);
  dv.setUint8(5, 0);
  dv.setUint32(6, body.byteLength);
  dv.setUint32(10, crc32c(body));
  out.set(body, HEADER_BYTES);
  return out;
}

export function decodeFrame(bytes: Uint8Array): { seq: number; flags: number; payload: Uint8Array } {
  const buf = asView(bytes);
  if (buf.byteLength < HEADER_BYTES) throw new Error('frame-too-short');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const seq = dv.getUint32(0);
  const flags = dv.getUint8(4);
  const reserved = dv.getUint8(5);
  const length = dv.getUint32(6);
  const crc = dv.getUint32(10);
  if (reserved !== 0) throw new Error('bad-reserved');
  if (length > CHUNK_SIZE) throw new Error('chunk-too-large');
  if (buf.byteLength !== HEADER_BYTES + length) throw new Error('length-mismatch');
  const payload = buf.subarray(HEADER_BYTES);
  if (crc32c(payload) !== crc) throw new Error('crc-mismatch');
  return { seq, flags, payload };
}

export class SendWindow {
  readonly size: number;
  readonly limit: number;
  sent = 0;
  acked = -1;

  constructor(size: number, limit = WINDOW_LIMIT) {
    this.size = size;
    this.limit = limit;
  }

  get total(): number {
    return Math.ceil(this.size / CHUNK_SIZE);
  }

  get remaining(): number {
    return Math.max(0, this.total - this.sent);
  }

  get inFlight(): number {
    return this.sent - (this.acked + 1);
  }

  get done(): boolean {
    return this.acked >= this.total - 1;
  }

  canSend(): boolean {
    return this.remaining > 0 && this.inFlight < this.limit;
  }

  take(): number {
    if (!this.canSend()) return -1;
    return this.sent++;
  }

  ack(seq: number): boolean {
    if (!Number.isInteger(seq) || seq <= this.acked) return false;
    this.acked = Math.min(seq, this.total - 1);
    return true;
  }

  rewind(from: number): void {
    const next = Math.max(0, Math.min(from, this.total));
    this.sent = next;
    this.acked = next - 1;
  }

  offsetFor(seq: number): number {
    return seq * CHUNK_SIZE;
  }

  endFor(seq: number): number {
    return Math.min(this.size, (seq + 1) * CHUNK_SIZE);
  }
}
