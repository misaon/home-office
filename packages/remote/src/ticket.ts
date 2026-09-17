import type { DeviceTicket } from "@ho/protocol";
import { type Bytes, concat, fromBase64Url, toBase64Url, utf8 } from "./bytes.ts";
import { ed25519Sign, ed25519Verify } from "./crypto.ts";

const ticketBytes = (
  instanceId: string,
  deviceId: string,
  devicePublicKey: Bytes,
  notAfter: string,
): Bytes =>
  concat(
    utf8("ho-relay ticket v1"),
    utf8(instanceId),
    utf8(deviceId),
    devicePublicKey,
    utf8(notAfter),
  );

export const issueTicket = async (
  instanceKey: CryptoKey,
  instanceId: string,
  deviceId: string,
  devicePublicKey: Bytes,
  notAfter: string,
): Promise<DeviceTicket> => ({
  notAfter,
  signature: toBase64Url(
    await ed25519Sign(instanceKey, ticketBytes(instanceId, deviceId, devicePublicKey, notAfter)),
  ),
});

export const verifyTicket = async (
  instancePublicKey: Bytes,
  instanceId: string,
  deviceId: string,
  devicePublicKey: Bytes,
  ticket: DeviceTicket,
  now: number,
): Promise<boolean> =>
  Date.parse(ticket.notAfter) > now &&
  ed25519Verify(
    instancePublicKey,
    fromBase64Url(ticket.signature),
    ticketBytes(instanceId, deviceId, devicePublicKey, ticket.notAfter),
  );

export const instanceChallenge = (nonce: Bytes, instanceId: string): Bytes =>
  concat(utf8("ho-relay instance v1"), nonce, utf8(instanceId));

export const deviceChallenge = (nonce: Bytes, instanceId: string, deviceId: string): Bytes =>
  concat(utf8("ho-relay device v1"), nonce, utf8(instanceId), utf8(deviceId));
