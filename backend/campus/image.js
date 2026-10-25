// Inspect the bytes, never the client filename or a data URL. The server sends
// only these raster types back with a fixed Content-Type and nosniff.
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const dimensions = (width, height) => Number.isInteger(width) && Number.isInteger(height) &&
  width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 32000000
const crc32 = (bytes) => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function png(bytes) {
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(pngSignature)) return false
  let offset = 8, header = false, pixels = false
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    if (length > bytes.length - offset - 12) return false
    const kind = bytes.toString('ascii', offset + 4, offset + 8)
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) return false
    if (!header) {
      if (kind !== 'IHDR' || length !== 13 ||
        !dimensions(bytes.readUInt32BE(offset + 8), bytes.readUInt32BE(offset + 12))) return false
      const depth = bytes[offset + 16], color = bytes[offset + 17]
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
      if (!depths[color]?.includes(depth) || bytes[offset + 18] || bytes[offset + 19] || bytes[offset + 20] > 1) return false
      header = true
    } else if (kind === 'IHDR') return false
    if (kind === 'IDAT' && length) pixels = true
    offset += length + 12
    if (kind === 'IEND') return length === 0 && pixels && offset === bytes.length
  }
  return false
}
function jpeg(bytes) {
  if (bytes.length < 20 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return false
  let offset = 2, frame = false
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) return false
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x00) return false
    const size = bytes.readUInt16BE(offset)
    if (size < 2 || offset + size > bytes.length - 2) return false
    if (frameMarkers.has(marker)) {
      if (size < 8 || !dimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3))) return false
      frame = true
    }
    if (marker === 0xda) return frame && size >= 6 && offset + size < bytes.length - 2
    offset += size
  }
  return false
}
function webp(bytes) {
  if (bytes.length < 26 || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) return false
  let offset = 12, pixels = false
  while (offset + 8 <= bytes.length) {
    const kind = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4)
    const start = offset + 8
    if (size > bytes.length - start) return false
    if (kind === 'VP8 ') {
      if (size < 10 || bytes[start] & 1 || !bytes.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 1, 0x2a])) ||
        !dimensions(bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff)) return false
      pixels = true
    } else if (kind === 'VP8L') {
      if (size < 5 || bytes[start] !== 0x2f) return false
      const bits = bytes.readUInt32LE(start + 1)
      if (bits >>> 29 || !dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)) return false
      pixels = true
    } else if (kind === 'VP8X') {
      if (size !== 10 || !dimensions(bytes.readUIntLE(start + 4, 3) + 1, bytes.readUIntLE(start + 7, 3) + 1)) return false
      // Animated uploads are not part of the shared photo contract.
      if (bytes[start] & 2) return false
    }
    offset = start + size + (size % 2)
  }
  return pixels && offset === bytes.length
}
export function inspectImage(buffer) {
  if (!Buffer.isBuffer(buffer)) return null
  if (png(buffer)) return { mime: 'image/png', extension: 'png' }
  if (jpeg(buffer)) return { mime: 'image/jpeg', extension: 'jpg' }
  if (webp(buffer)) return { mime: 'image/webp', extension: 'webp' }
  return null
}
