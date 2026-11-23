// Generates the extension's PNG icons at exact store sizes. Chrome refuses to
// load an unpacked extension whose manifest points at missing icons, and the
// Web Store wants a real 128px icon, so these are generated deterministically
// instead of being hand-made binaries.

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'extension', 'icons')

const CRC = new Int32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC[n] = c
}

function crc32(buffer) {
  let c = -1
  for (let i = 0; i < buffer.length; i += 1) c = CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0 // no filter
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const SS = 4 // supersampling per axis

function render(size) {
  const S = size * SS
  const radius = S * 0.23
  const ringRadius = S * 0.3
  const ringWidth = Math.max(S * 0.07, SS * 0.9)
  const dotRadius = S * 0.105
  const center = S / 2
  const acc = new Float64Array(S * S * 4)

  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const px = x + 0.5
      const py = y + 0.5
      const cx = Math.min(Math.max(px, radius), S - radius)
      const cy = Math.min(Math.max(py, radius), S - radius)
      const dx = px - cx
      const dy = py - cy
      if (dx * dx + dy * dy > radius * radius) continue

      const t = py / S
      let r = 0.38 + 0.34 * t
      let g = 0.3 + 0.13 * t
      let b = 0.94 - 0.03 * t

      const distance = Math.hypot(px - center, py - center)
      if (Math.abs(distance - ringRadius) <= ringWidth / 2) {
        r = 1
        g = 1
        b = 1
      }
      if (distance <= dotRadius) {
        r = 1
        g = 1
        b = 1
      }

      const index = (y * S + x) * 4
      acc[index] = r
      acc[index + 1] = g
      acc[index + 2] = b
      acc[index + 3] = 1
    }
  }

  const out = Buffer.alloc(size * size * 4)
  const samples = SS * SS
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const index = ((y * SS + sy) * S + (x * SS + sx)) * 4
          const alpha = acc[index + 3]
          r += acc[index] * alpha
          g += acc[index + 1] * alpha
          b += acc[index + 2] * alpha
          a += alpha
        }
      }
      const alpha = a / samples
      const offset = (y * size + x) * 4
      out[offset] = Math.round(Math.min(1, Math.max(0, a ? r / a : 0)) * 255)
      out[offset + 1] = Math.round(Math.min(1, Math.max(0, a ? g / a : 0)) * 255)
      out[offset + 2] = Math.round(Math.min(1, Math.max(0, a ? b / a : 0)) * 255)
      out[offset + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    }
  }

  return encodePng(size, out)
}

mkdirSync(outDir, { recursive: true })
for (const size of [16, 32, 48, 128]) {
  const file = join(outDir, `icon${size}.png`)
  writeFileSync(file, render(size))
  console.log(`wrote ${file}`)
}
