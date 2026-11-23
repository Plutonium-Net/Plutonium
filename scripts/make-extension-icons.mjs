// Generates the extension's PNG icons at exact store sizes.
//
// The icon is the app's own white Pluto mark (public/icon-white.png): the artwork
// is cropped to what is drawn, recoloured pure white and scaled down with area
// averaging, on a transparent background. Chrome refuses to load an unpacked
// extension whose manifest points at missing icons, and the Web Store wants a
// real 128px icon, so these are generated deterministically instead of being
// hand-made binaries.

import { deflateSync, inflateSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'extension', 'icons')
const markFile = join(root, 'public', 'icon-white.png')

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

/* ------------------------------------------------------------------ *
 * Reading the mark
 * ------------------------------------------------------------------ */

// Minimal PNG reader: 8 bit, non-interlaced, RGB or RGBA. That is exactly what
// the app's icon asset is, and it keeps the build free of image dependencies.
function decodePng(buffer) {
  if (buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error('not a PNG')
  let offset = 8
  let header = null
  const idat = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (type === 'IHDR') {
      header = {
        width: buffer.readUInt32BE(offset + 8),
        height: buffer.readUInt32BE(offset + 12),
        depth: buffer[offset + 16],
        color: buffer[offset + 17],
        interlace: buffer[offset + 20],
      }
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(offset + 8, offset + 8 + length))
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  if (!header) throw new Error('PNG has no header')
  if (header.depth !== 8 || header.interlace !== 0 || (header.color !== 6 && header.color !== 2)) {
    throw new Error('expected an 8 bit non-interlaced RGB or RGBA PNG')
  }

  const channels = header.color === 6 ? 4 : 3
  const stride = header.width * channels
  const raw = inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(stride * header.height)

  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const from = y * (stride + 1) + 1
    const to = y * stride
    const up = to - stride
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[to + x - channels] : 0
      const above = y > 0 ? pixels[up + x] : 0
      const corner = y > 0 && x >= channels ? pixels[up + x - channels] : 0
      let value = raw[from + x]
      if (filter === 1) value += left
      else if (filter === 2) value += above
      else if (filter === 3) value += (left + above) >> 1
      else if (filter === 4) {
        const estimate = left + above - corner
        const a = Math.abs(estimate - left)
        const b = Math.abs(estimate - above)
        const c = Math.abs(estimate - corner)
        value += a <= b && a <= c ? left : b <= c ? above : corner
      }
      pixels[to + x] = value & 0xff
    }
  }

  const alpha = new Float64Array(header.width * header.height)
  for (let i = 0; i < alpha.length; i += 1) {
    alpha[i] = channels === 4 ? pixels[i * channels + 3] / 255 : 1
  }
  return { width: header.width, height: header.height, alpha }
}

const mark = decodePng(readFileSync(markFile))

// The asset has breathing room around the artwork, so crop to what is actually
// drawn and fit that to the icon instead of trusting the canvas size.
let minX = mark.width
let minY = mark.height
let maxX = -1
let maxY = -1
for (let y = 0; y < mark.height; y += 1) {
  for (let x = 0; x < mark.width; x += 1) {
    if (mark.alpha[y * mark.width + x] <= 0.04) continue
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
}
if (maxX < 0) throw new Error('the white Pluto mark is empty')
const markWidth = maxX - minX + 1
const markHeight = maxY - minY + 1

// Summed area table, so a scaled pixel can average its whole source footprint
// instead of sampling one texel.
const integralWidth = mark.width + 1
const integral = new Float64Array(integralWidth * (mark.height + 1))
for (let y = 0; y < mark.height; y += 1) {
  let row = 0
  for (let x = 0; x < mark.width; x += 1) {
    row += mark.alpha[y * mark.width + x]
    integral[(y + 1) * integralWidth + x + 1] = integral[y * integralWidth + x + 1] + row
  }
}

function coverage(x0, y0, x1, y1) {
  // The table is indexed by whole texels, so the footprint is snapped outward.
  const ax = Math.min(Math.max(Math.floor(x0), 0), mark.width)
  const ay = Math.min(Math.max(Math.floor(y0), 0), mark.height)
  const bx = Math.min(Math.max(Math.ceil(x1), 0), mark.width)
  const by = Math.min(Math.max(Math.ceil(y1), 0), mark.height)
  const area = (bx - ax) * (by - ay)
  if (area <= 0) return 0
  const sum =
    integral[by * integralWidth + bx] -
    integral[ay * integralWidth + bx] -
    integral[by * integralWidth + ax] +
    integral[ay * integralWidth + ax]
  return sum / area
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

const SS = 4 // supersampling per axis
const FILL = 0.94 // share of the icon the mark spans

function render(size) {
  const S = size * SS
  const scale = (S * FILL) / Math.max(markWidth, markHeight)
  const left = (S - markWidth * scale) / 2
  const top = (S - markHeight * scale) / 2
  const mask = new Float64Array(S * S)

  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      mask[y * S + x] = coverage(
        minX + (x - left) / scale,
        minY + (y - top) / scale,
        minX + (x + 1 - left) / scale,
        minY + (y + 1 - top) / scale,
      )
    }
  }

  const out = Buffer.alloc(size * size * 4)
  const samples = SS * SS
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let alpha = 0
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          alpha += mask[(y * SS + sy) * S + (x * SS + sx)]
        }
      }
      const offset = (y * size + x) * 4
      out[offset] = 255
      out[offset + 1] = 255
      out[offset + 2] = 255
      out[offset + 3] = Math.round(Math.min(1, alpha / samples) * 255)
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
