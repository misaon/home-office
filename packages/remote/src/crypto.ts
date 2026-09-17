import type { Bytes } from "./bytes.ts";

export type KeyPair = { publicKey: Bytes; privateKey: CryptoKey };

const { subtle } = crypto;

const asPair = (key: CryptoKey | CryptoKeyPair): CryptoKeyPair => {
  if ("privateKey" in key) {
    return key;
  }
  throw new Error("expected a key pair");
};

const rawOf = async (key: CryptoKey): Promise<Bytes> =>
  new Uint8Array(await subtle.exportKey("raw", key));

export const generateX25519 = async (): Promise<KeyPair> => {
  const pair = asPair(await subtle.generateKey({ name: "X25519" }, false, ["deriveBits"]));
  return { publicKey: await rawOf(pair.publicKey), privateKey: pair.privateKey };
};

export const x25519 = async (privateKey: CryptoKey, peerPublicKey: Bytes): Promise<Bytes> => {
  const peer = await subtle.importKey("raw", peerPublicKey, { name: "X25519" }, false, []);
  const shared = new Uint8Array(
    await subtle.deriveBits({ name: "X25519", public: peer }, privateKey, 256),
  );
  if (shared.every((byte) => byte === 0)) {
    throw new Error("degenerate key exchange");
  }
  return shared;
};

export const hkdf = async (
  ikm: Bytes,
  salt: Bytes,
  info: Bytes,
  length: number,
): Promise<Bytes> => {
  const key = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8),
  );
};

export const hmacSha256 = async (key: Bytes, data: Bytes): Promise<Bytes> => {
  const imported = await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await subtle.sign("HMAC", imported, data));
};

export const aesGcmKey = (secret: Bytes): Promise<CryptoKey> =>
  subtle.importKey("raw", secret, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

export const aesGcmSeal = async (
  key: CryptoKey,
  nonce: Bytes,
  additionalData: Bytes,
  plaintext: Bytes,
): Promise<Bytes> =>
  new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData }, key, plaintext),
  );

export const aesGcmOpen = async (
  key: CryptoKey,
  nonce: Bytes,
  additionalData: Bytes,
  ciphertext: Bytes,
): Promise<Bytes> =>
  new Uint8Array(
    await subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData }, key, ciphertext),
  );

export const generateEd25519 = async (extractable: boolean): Promise<KeyPair> => {
  const pair = asPair(
    await subtle.generateKey({ name: "Ed25519" }, extractable, ["sign", "verify"]),
  );
  return { publicKey: await rawOf(pair.publicKey), privateKey: pair.privateKey };
};

export const ed25519Sign = async (privateKey: CryptoKey, data: Bytes): Promise<Bytes> =>
  new Uint8Array(await subtle.sign({ name: "Ed25519" }, privateKey, data));

export const ed25519Verify = async (
  publicKey: Bytes,
  signature: Bytes,
  data: Bytes,
): Promise<boolean> => {
  try {
    const key = await subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, ["verify"]);
    return await subtle.verify({ name: "Ed25519" }, key, signature, data);
  } catch {
    return false;
  }
};

export type Ed25519Jwk = { kty: "OKP"; crv: "Ed25519"; x: string; d: string };

export const exportEd25519Private = async (key: CryptoKey): Promise<Ed25519Jwk> => {
  const jwk = await subtle.exportKey("jwk", key);
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || jwk.x === undefined || jwk.d === undefined) {
    throw new Error("not an Ed25519 private key");
  }
  return { kty: "OKP", crv: "Ed25519", x: jwk.x, d: jwk.d };
};

export const importEd25519Private = (jwk: Ed25519Jwk): Promise<CryptoKey> =>
  subtle.importKey("jwk", { ...jwk }, { name: "Ed25519" }, false, ["sign"]);
