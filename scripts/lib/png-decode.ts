import { blank, type Rgba, setPixel, SIGNATURE, u32 } from "./png.ts";

type Header = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
};

const channelsOf = (colorType: number): number => {
  switch (colorType) {
    case 0: {
      return 1;
    }
    case 2: {
      return 3;
    }
    case 3: {
      return 1;
    }
    case 4: {
      return 2;
    }
    case 6: {
      return 4;
    }
    default: {
      throw new Error(`unsupported PNG colour type ${String(colorType)}`);
    }
  }
};

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  return pb <= pc ? b : c;
};

function unfilter(raw: Uint8Array, header: Header, bpp: number, stride: number): Uint8Array {
  const out = new Uint8Array(header.height * stride);
  let offset = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[offset] ?? 0;
    offset += 1;
    const line = raw.subarray(offset, offset + stride);
    offset += stride;
    const prev = y === 0 ? null : out.subarray((y - 1) * stride, y * stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const x = line[i] ?? 0;
      const a = i >= bpp ? (cur[i - bpp] ?? 0) : 0;
      const b = prev === null ? 0 : (prev[i] ?? 0);
      const c = prev === null || i < bpp ? 0 : (prev[i - bpp] ?? 0);
      let v: number;
      switch (filter) {
        case 0: {
          v = x;
          break;
        }
        case 1: {
          v = x + a;
          break;
        }
        case 2: {
          v = x + b;
          break;
        }
        case 3: {
          v = x + Math.floor((a + b) / 2);
          break;
        }
        case 4: {
          v = x + paeth(a, b, c);
          break;
        }
        default: {
          throw new Error(`bad PNG filter ${String(filter)}`);
        }
      }
      cur[i] = v & 0xff;
    }
  }
  return out;
}

export function decodePng(bytes: Uint8Array): Rgba {
  for (let i = 0; i < 8; i += 1) {
    if (bytes[i] !== SIGNATURE[i]) {
      throw new Error("not a PNG file");
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let header: Header | null = null;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (offset < bytes.length) {
    const length = u32(view, offset);
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      const h = new DataView(data.buffer, data.byteOffset, data.byteLength);
      header = {
        width: h.getUint32(0),
        height: h.getUint32(4),
        bitDepth: data[8] ?? 8,
        colorType: data[9] ?? 6,
        interlace: data[12] ?? 0,
      };
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      trns = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (header === null) {
    throw new Error("PNG without IHDR");
  }
  if (header.interlace !== 0) {
    throw new Error("interlaced PNGs are not supported; re-export without Adam7");
  }
  const zlib = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of idat) {
    zlib.set(chunk, at);
    at += chunk.length;
  }
  // zlib stream: 2-byte header, raw deflate, 4-byte adler32.
  const raw = Bun.inflateSync(zlib.subarray(2, zlib.length - 4));
  const channels = channelsOf(header.colorType);
  const bytesPerSample = header.bitDepth === 16 ? 2 : 1;
  if (header.bitDepth < 8) {
    throw new Error(`PNG bit depth ${String(header.bitDepth)} is not supported; export 8-bit RGBA`);
  }
  const bpp = channels * bytesPerSample;
  const stride = header.width * bpp;
  const pixels = unfilter(raw, header, bpp, stride);
  const out = blank(header.width, header.height);
  for (let y = 0; y < header.height; y += 1) {
    for (let x = 0; x < header.width; x += 1) {
      const p = y * stride + x * bpp;
      const s = (k: number): number => pixels[p + k * bytesPerSample] ?? 0;
      let rgba: [number, number, number, number];
      switch (header.colorType) {
        case 0: {
          rgba = [s(0), s(0), s(0), 255];
          break;
        }
        case 2: {
          rgba = [s(0), s(1), s(2), 255];
          break;
        }
        case 3: {
          const index = s(0);
          rgba = [
            palette?.[index * 3] ?? 0,
            palette?.[index * 3 + 1] ?? 0,
            palette?.[index * 3 + 2] ?? 0,
            trns === null ? 255 : (trns[index] ?? 255),
          ];
          break;
        }
        case 4: {
          rgba = [s(0), s(0), s(0), s(1)];
          break;
        }
        default: {
          rgba = [s(0), s(1), s(2), s(3)];
        }
      }
      setPixel(out, x, y, rgba);
    }
  }
  return out;
}
