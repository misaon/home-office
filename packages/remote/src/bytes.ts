export type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHUNK = 0x8000;

export const utf8 = (value: string): Bytes => encoder.encode(value);

export const textOf = (bytes: Bytes): string => decoder.decode(bytes);

export const concat = (...parts: readonly Bytes[]): Bytes => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

export const randomBytes = (length: number): Bytes =>
  crypto.getRandomValues(new Uint8Array(length));

export const uint64 = (value: number): Bytes => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value));
  return out;
};

export const equalBytes = (a: Bytes, b: Bytes): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
};

export const toBase64Url = (bytes: Bytes): string => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCodePoint(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

export const fromBase64Url = (value: string): Bytes => {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.codePointAt(index) ?? 0;
  }
  return out;
};

export const toBase32 = (bytes: Bytes): string => {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31] ?? "";
      bits -= 5;
      value &= (1 << bits) - 1;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31] ?? "";
  }
  return out;
};

export const fromBase32 = (value: string): Bytes => {
  const clean = value
    .toUpperCase()
    .replaceAll(/[\s-]/gu, "")
    .replaceAll("O", "0")
    .replaceAll(/[IL]/gu, "1");
  const out: number[] = [];
  let bits = 0;
  let value32 = 0;
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`invalid base32 character "${char}"`);
    }
    value32 = (value32 << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value32 >>> (bits - 8)) & 255);
      bits -= 8;
      value32 &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(out);
};

export const sha256Bytes = async (data: Bytes): Promise<Bytes> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", data));
