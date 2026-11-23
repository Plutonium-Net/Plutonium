// Builds the Chrome Web Store upload: a zip whose root contains manifest.json.
// Runtime files only — notes, listing copy and scripts stay out of the package.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const extensionDir = join(root, 'extension')

const manifest = JSON.parse(readFileSync(join(extensionDir, 'manifest.json'), 'utf8'))
const files = [
  'manifest.json',
  'background.js',
  'content.js',
  'offscreen.html',
  'offscreen.js',
  ...(manifest.icons ? Object.values(manifest.icons) : []),
  ...(manifest.action?.default_icon ? Object.values(manifest.action.default_icon) : []),
].filter((value, index, list) => list.indexOf(value) === index)

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

const locals = []
const centrals = []
let offset = 0

for (const relative of files) {
  const data = readFileSync(join(extensionDir, relative))
  const name = Buffer.from(relative, 'utf8')
  const crc = crc32(data)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0, 6)
  local.writeUInt16LE(0, 8)
  local.writeUInt16LE(0, 10)
  local.writeUInt16LE(0, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26)
  local.writeUInt16LE(0, 28)
  locals.push(local, name, data)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(0, 10)
  central.writeUInt16LE(0, 12)
  central.writeUInt16LE(0, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt16LE(0, 30)
  central.writeUInt16LE(0, 32)
  central.writeUInt16LE(0, 34)
  central.writeUInt16LE(0, 36)
  central.writeUInt32LE(0, 38)
  central.writeUInt32LE(offset, 42)
  centrals.push(central, name)

  offset += local.length + name.length + data.length
}

const centralBuffer = Buffer.concat(centrals)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(0, 4)
end.writeUInt16LE(0, 6)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(centralBuffer.length, 12)
end.writeUInt32LE(offset, 16)
end.writeUInt16LE(0, 20)

const zip = Buffer.concat([...locals, centralBuffer, end])
const outDir = join(root, 'dist', 'store')
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, `plutonium-clip-${manifest.version}.zip`)
writeFileSync(outFile, zip)

console.log(`packed ${files.length} files into ${outFile}`)
console.log(files.map((file) => `  ${file}`).join('\n'))
