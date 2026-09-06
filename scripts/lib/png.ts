// Minimal PNG codec for the asset pipeline: 8-bit RGBA in memory, no native dependencies.
// Decodes non-interlaced PNGs of colour types 0/2/3/4/6 (8 or 16 bit); encodes RGBA8 with zlib via Bun.

export type Rgba = { width: number; height: number; data: Uint8Array };

export const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
export const u32 = (view: DataView, at: number): number => view.getUint32(at);

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}
const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of bytes) {
    c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};
const adler32 = (bytes: Uint8Array): number => {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
};

export const blank = (width: number, height: number): Rgba => ({
  width,
  height,
  data: new Uint8Array(width * height * 4),
});

export const setPixel = (
  img: Rgba,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): void => {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) {
    return;
  }
  const i = (y * img.width + x) * 4;
  img.data.set(rgba, i);
};

export const fillRect = (
  img: Rgba,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: readonly [number, number, number, number],
): void => {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      setPixel(img, xx, yy, rgba);
    }
  }
};

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};

const paethPredict = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * Filters one RGBA8 scanline with PNG filter `type` (0 none, 1 Sub, 2 Up, 3 Average, 4 Paeth) into `out`
 * and returns the sum of absolute values — the standard heuristic for picking the filter per row.
 */
function filterRow(cur: Uint8Array, prev: Uint8Array, type: number, out: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < cur.length; i += 1) {
    const x = cur[i] ?? 0;
    const a = i >= 4 ? (cur[i - 4] ?? 0) : 0;
    const b = prev[i] ?? 0;
    const c = i >= 4 ? (prev[i - 4] ?? 0) : 0;
    let predicted = 0;
    if (type === 1) {
      predicted = a;
    } else if (type === 2) {
      predicted = b;
    } else if (type === 3) {
      predicted = (a + b) >> 1;
    } else if (type === 4) {
      predicted = paethPredict(a, b, c);
    }
    const v = (x - predicted) & 0xff;
    out[i] = v;
    sum += v < 128 ? v : 256 - v;
  }
  return sum;
}

export function encodePng(img: Rgba): Uint8Array {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, img.width);
  v.setUint32(4, img.height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const stride = img.width * 4;
  const raw = new Uint8Array(img.height * (stride + 1));
  const candidate = new Uint8Array(stride);
  let prev: Uint8Array = new Uint8Array(stride);
  for (let y = 0; y < img.height; y += 1) {
    const cur = img.data.subarray(y * stride, (y + 1) * stride);
    let best = 0;
    let bestSum = Number.POSITIVE_INFINITY;
    for (let type = 0; type <= 4; type += 1) {
      const sum = filterRow(cur, prev, type, candidate);
      if (sum < bestSum) {
        bestSum = sum;
        best = type;
        raw.set(candidate, y * (stride + 1) + 1);
      }
    }
    raw[y * (stride + 1)] = best;
    prev = cur;
  }
  const deflated = Bun.deflateSync(raw, { level: 9 });
  const zlib = new Uint8Array(deflated.length + 6);
  zlib.set([0x78, 0xda], 0);
  zlib.set(deflated, 2);
  new DataView(zlib.buffer).setUint32(zlib.length - 4, adler32(raw));
  const parts = [
    new Uint8Array(SIGNATURE),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
