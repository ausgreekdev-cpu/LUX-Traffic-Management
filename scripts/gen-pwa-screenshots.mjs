import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

class Canvas {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.buf = Buffer.alloc(width * height * 4);
    this.buf.fill(0);
  }
  set(x, y, [r, g, b, a = 255]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const dstA = this.buf[i + 3] / 255;
    const srcA = a / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA === 0) return;
    const col = [r, g, b];
    for (let c = 0; c < 3; c++) {
      this.buf[i + c] = Math.round((col[c] * srcA + this.buf[i + c] * dstA * (1 - srcA)) / outA);
    }
    this.buf[i + 3] = Math.round(outA * 255);
  }
  fillRect(x, y, w, h, color, radius = 0) {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        if (!radius) { this.set(px, py, color); continue; }
        const dx = Math.max(x + radius - px, 0, px - (x + w - radius - 1));
        const dy = Math.max(y + radius - py, 0, py - (y + h - radius - 1));
        if (dx * dx + dy * dy <= radius * radius) this.set(px, py, color);
      }
    }
  }
  circle(cx, cy, r, color) {
    for (let py = cy - r; py <= cy + r; py++) {
      for (let px = cx - r; px <= cx + r; px++) {
        const dx = px - cx, dy = py - cy;
        if (dx * dx + dy * dy <= r * r) this.set(px, py, color);
      }
    }
  }
  vGradient(x, y, w, h, from, to) {
    const f = hexToRgb(from), t = hexToRgb(to);
    for (let py = y; py < y + h; py++) {
      const t0 = Math.max(0, Math.min(1, (py - y) / (h - 1 || 1)));
      const c = f.map((v, i) => Math.round(v + (t[i] - v) * t0));
      for (let px = x; px < x + w; px++) this.set(px, py, [...c, 255]);
    }
  }
  toPng() {
    return encodePng(this.w, this.h, this.buf);
  }
}

const ACCENT = hexToRgb('#f57f17');
const GRAY = hexToRgb('#1f2937');
const DARK = hexToRgb('#111827');
const BORDER = hexToRgb('#374151');
const WHITE = hexToRgb('#f9fafb');
const MUTED = hexToRgb('#6b7280');
const BLUE = hexToRgb('#3b82f6');
const GREEN = hexToRgb('#22c55e');
const PURPLE = hexToRgb('#a855f7');
const RED = hexToRgb('#ef4444');

function drawWide(c) {
  c.vGradient(0, 0, c.w, c.h, '#111827', '#0b1220');
  c.fillRect(0, 0, 232, c.h, [31, 41, 55], 0);
  c.fillRect(44, 36, 44, 44, ACCENT, 10);
  c.fillRect(100, 48, 92, 12, WHITE, 6);
  c.fillRect(100, 66, 62, 8, MUTED, 4);
  const items = [0, 52, 104, 156, 208, 260];
  for (let i = 0; i < items.length; i++) {
    const y = 140 + i * 52;
    c.fillRect(36, y, 160, 34, i === 0 ? [55, 65, 81] : GRAY, 8);
    c.fillRect(48, y + 12, 16, 10, i === 0 ? ACCENT : [75, 85, 99], 3);
    c.fillRect(72, y + 8, 96, 8, i === 0 ? WHITE : [75, 85, 99], 4);
    c.fillRect(72, y + 20, 62, 6, [55, 65, 81], 3);
  }
  c.fillRect(276, 40, 340, 22, [55, 65, 81], 11);
  c.fillRect(288, 48, 14, 6, MUTED, 3);
  c.circle(1024, 58, 16, [31, 41, 55]);
  c.circle(1032, 50, 5, RED);
  c.fillRect(1070, 44, 150, 26, GRAY, 8);
  c.circle(1084, 57, 8, PURPLE);

  const cards = [
    { x: 276, color: BLUE }, { x: 618, color: GREEN },
    { x: 960, color: PURPLE }, { x: 1302, color: ACCENT }
  ];
  for (const card of cards) {
    c.fillRect(card.x, 96, 306, 110, GRAY, 12);
    c.fillRect(card.x + 24, 122, 40, 40, card.color, 10);
    c.fillRect(card.x + 24, 176, 90, 10, WHITE, 5);
    c.fillRect(card.x + 24, 192, 62, 7, MUTED, 3);
  }
  c.fillRect(276, 238, 664, 300, GRAY, 12);
  c.fillRect(300, 266, 150, 14, WHITE, 7);
  c.fillRect(300, 288, 100, 8, MUTED, 4);
  const bars = [90, 140, 110, 180, 150, 210, 120, 170, 200, 130, 160, 230, 100, 190, 220, 140];
  const bw = 28, gap = 12;
  for (let i = 0; i < bars.length; i++) {
    const bx = 316 + i * (bw + gap);
    const bh = bars[i];
    c.fillRect(bx, 512 - bh, bw, bh, i % 3 === 0 ? ACCENT : i % 3 === 1 ? BLUE : PURPLE, 6);
  }
  c.fillRect(964, 238, 352, 300, GRAY, 12);
  c.fillRect(988, 266, 120, 14, WHITE, 7);
  for (let i = 0; i < 5; i++) {
    const y = 306 + i * 44;
    c.circle(1006, y + 8, 9, [i % 2 ? GREEN : BLUE, [75, 85, 99]][0]);
    c.fillRect(1030, y, 200, 8, [55, 65, 81], 4);
    c.fillRect(1030, y + 14, 140, 6, [55, 65, 81], 3);
    c.fillRect(1218, y, 46, 12, [55, 65, 81], 6);
  }
  c.fillRect(276, 566, 664, 108, GRAY, 12);
  for (let i = 0; i < 3; i++) {
    const x = 300 + i * 216;
    c.fillRect(x, 592, 168, 14, WHITE, 7);
    c.fillRect(x, 614, 210, 8, [55, 65, 81], 4);
    c.fillRect(x, 630, 180, 8, [55, 65, 81], 4);
    c.fillRect(x + 130, 592, 44, 12, ACCENT, 6);
  }
  c.fillRect(964, 566, 352, 108, GRAY, 12);
  c.fillRect(988, 592, 120, 14, WHITE, 7);
  for (let i = 0; i < 3; i++) {
    c.fillRect(988, 622 + i * 16, 190 - i * 40, 8, [55, 65, 81], 4);
  }
}

function drawNarrow(c) {
  c.vGradient(0, 0, c.w, c.h, '#111827', '#0b1220');
  c.fillRect(0, 0, c.w, 64, [31, 41, 55], 0);
  c.fillRect(28, 18, 32, 32, ACCENT, 8);
  c.fillRect(72, 26, 96, 12, WHITE, 6);
  c.circle(660, 34, 14, GRAY);
  c.circle(668, 27, 5, RED);
  c.fillRect(36, 100, 200, 22, [55, 65, 81], 11);
  c.fillRect(48, 108, 14, 6, MUTED, 3);
  const cards = [
    { x: 36, y: 148, color: BLUE }, { x: 380, y: 148, color: GREEN },
    { x: 36, y: 286, color: PURPLE }, { x: 380, y: 286, color: ACCENT }
  ];
  for (const card of cards) {
    c.fillRect(card.x, card.y, 320, 112, GRAY, 12);
    c.fillRect(card.x + 22, card.y + 24, 42, 42, card.color, 10);
    c.fillRect(card.x + 22, card.y + 78, 100, 10, WHITE, 5);
    c.fillRect(card.x + 22, card.y + 94, 66, 7, MUTED, 3);
  }
  c.fillRect(36, 424, 664, 340, GRAY, 12);
  c.fillRect(60, 452, 160, 14, WHITE, 7);
  const bars = [90, 150, 110, 190, 140, 220, 130, 170, 210, 120, 180, 200, 150, 230, 160, 190];
  const bw = 30, gap = 10;
  for (let i = 0; i < bars.length; i++) {
    const bx = 60 + i * (bw + gap);
    const bh = bars[i];
    c.fillRect(bx, 736 - bh, bw, bh, i % 3 === 0 ? ACCENT : i % 3 === 1 ? BLUE : PURPLE, 6);
  }
  c.fillRect(36, 796, 664, 160, GRAY, 12);
  c.fillRect(60, 820, 120, 14, WHITE, 7);
  for (let i = 0; i < 3; i++) {
    const y = 854 + i * 32;
    c.circle(74, y + 8, 9, [GREEN, BLUE, PURPLE][i]);
    c.fillRect(96, y, 260, 8, [55, 65, 81], 4);
    c.fillRect(96, y + 14, 190, 6, [55, 65, 81], 3);
    c.fillRect(600, y, 64, 12, [55, 65, 81], 6);
  }
  c.fillRect(36, 980, 664, 150, GRAY, 12);
  c.fillRect(60, 1006, 130, 14, WHITE, 7);
  for (let i = 0; i < 3; i++) {
    const x = 60 + i * 224;
    c.fillRect(x, 1036, 160, 14, WHITE, 7);
    c.fillRect(x, 1060, 196, 8, [55, 65, 81], 4);
    c.fillRect(x, 1076, 150, 8, [55, 65, 81], 4);
    c.fillRect(x + 120, 1036, 44, 12, ACCENT, 6);
  }
  c.fillRect(36, 1152, 664, 96, GRAY, 12);
  c.fillRect(60, 1174, 90, 12, WHITE, 7);
  c.fillRect(60, 1198, 260, 8, [55, 65, 81], 4);
  c.fillRect(60, 1214, 200, 8, [55, 65, 81], 4);
}

const wide = new Canvas(1280, 720);
drawWide(wide);
const narrow = new Canvas(720, 1280);
drawNarrow(narrow);

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'public');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'screenshot-wide.png'), wide.toPng());
writeFileSync(join(outDir, 'screenshot-narrow.png'), narrow.toPng());
console.log('Generated frontend/public/screenshot-wide.png (1280x720) and screenshot-narrow.png (720x1280)');
