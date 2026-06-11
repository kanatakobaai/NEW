// Generates real PNG app icons (neon core on dark bg) using only Node built-ins.
import zlib from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function makeIcon(size) {
  const cx = size / 2, cy = size / 2;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / (size / 2);
      // dark background
      let r = 5, g = 6, b = 15;
      // outer ring (shield) ~0.78
      const ring = Math.exp(-Math.pow((d - 0.74) / 0.06, 2));
      r += ring * 120; g += ring * 255; b += ring * 255;
      // central neon core
      const core = Math.max(0, 1 - d / 0.42);
      r += core * 120; g += core * 200; b += core * 255;
      raw[o++] = Math.min(255, r);
      raw[o++] = Math.min(255, g);
      raw[o++] = Math.min(255, b);
      raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../assets/icon-${size}.png`, import.meta.url), makeIcon(size));
  console.log(`wrote assets/icon-${size}.png`);
}
