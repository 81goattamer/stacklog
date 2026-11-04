// アプリアイコン（PNG）を生成する: node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

const sdRoundRect = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.abs(x - cx) - hw + r, dy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};

// 積み重ねた本。icon.svg と同じ位置・色（0..1 の座標）
const BOOKS = [
  { cx: 0.5, cy: 0.71, hw: 0.31, hh: 0.075, color: [62, 123, 250] },
  { cx: 0.47, cy: 0.5, hw: 0.25, hh: 0.075, color: [255, 159, 67] },
  { cx: 0.54, cy: 0.29, hw: 0.21, hh: 0.075, color: [64, 200, 170] },
];

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const bg = [16, 20, 36];
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size, y = (py + 0.5) / size;
      const aa = 1.2 / size;
      let col = bg;
      for (const b of BOOKS) {
        const w = Math.min(1, Math.max(0, 0.5 - sdRoundRect(x, y, b.cx, b.cy, b.hw, b.hh, 0.02) / aa));
        col = col.map((v, i) => v + (b.color[i] - v) * w);
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const s of [180, 192, 512]) writeFileSync(new URL(`../icons/icon-${s}.png`, import.meta.url), png(s));
