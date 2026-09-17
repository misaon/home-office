import { RemoteId } from "@ho/protocol";
import {
  type Bytes,
  concat,
  fromBase32,
  randomBytes,
  sha256Bytes,
  toBase32,
  utf8,
} from "./bytes.ts";
import { hkdf } from "./crypto.ts";

const PAIRING_CODE_PREFIX = "HO1";
const SECRET_BYTES = 32;
const ID_BYTES = 16;
const GROUP = 4;

export const newRemoteId = (): string => toBase32(randomBytes(ID_BYTES));

export const instanceIdOf = async (publicKey: Bytes): Promise<string> => {
  const digest = await sha256Bytes(publicKey);
  return toBase32(digest.slice(0, ID_BYTES));
};

export type Pairing = { pairingId: string; psk: Bytes };

export const pairingOf = async (instanceId: string, secret: Bytes): Promise<Pairing> => {
  const digest = await sha256Bytes(concat(utf8("ho-remote pairing id v1"), secret));
  return {
    pairingId: toBase32(digest.slice(0, ID_BYTES)),
    psk: await hkdf(secret, utf8("ho-remote pairing psk v1"), utf8(instanceId), SECRET_BYTES),
  };
};

const grouped = (value: string): string =>
  value.match(new RegExp(`.{1,${String(GROUP)}}`, "gu"))?.join("-") ?? value;

export const formatPairingCode = (instanceId: string, secret: Bytes): string =>
  `${PAIRING_CODE_PREFIX}-${instanceId}-${grouped(toBase32(secret))}`;

export const newPairingSecret = (): Bytes => randomBytes(SECRET_BYTES);

export const parsePairingCode = (code: string): { instanceId: string; secret: Bytes } => {
  const parts = code.trim().toUpperCase().split("-");
  const [prefix, instanceId, ...rest] = parts;
  if (prefix !== PAIRING_CODE_PREFIX || instanceId === undefined || rest.length === 0) {
    throw new Error("that is not a Home Office pairing code");
  }
  const secret = fromBase32(rest.join(""));
  if (!RemoteId.safeParse(instanceId).success || secret.length !== SECRET_BYTES) {
    throw new Error("the pairing code is damaged");
  }
  return { instanceId, secret };
};
