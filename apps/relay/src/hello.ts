import type { RelayErrorCode, RelayHello } from "@ho/protocol";
import {
  type Bytes,
  deviceChallenge,
  ed25519Verify,
  fromBase64Url,
  instanceChallenge,
  instanceIdOf,
  verifyTicket,
} from "@ho/remote";

export type InstanceHello = Extract<RelayHello, { t: "instance" }>;
export type DeviceHello = Extract<RelayHello, { t: "device" }>;
export type Refusal = { code: RelayErrorCode; message: string };

export async function checkInstanceHello(
  hello: InstanceHello,
  nonce: Bytes,
): Promise<Refusal | null> {
  const publicKey = fromBase64Url(hello.publicKey);
  const derivedId = await instanceIdOf(publicKey);
  const signed =
    derivedId === hello.instanceId &&
    (await ed25519Verify(
      publicKey,
      fromBase64Url(hello.signature),
      instanceChallenge(nonce, hello.instanceId),
    ));
  return signed ? null : { code: "bad_signature", message: "the instance did not prove its key" };
}

export async function checkDeviceHello(
  hello: DeviceHello,
  nonce: Bytes,
  now: number,
): Promise<Refusal | null> {
  const instancePublicKey = fromBase64Url(hello.instancePublicKey);
  const devicePublicKey = fromBase64Url(hello.publicKey);
  const derivedId = await instanceIdOf(instancePublicKey);
  const ticketValid =
    derivedId === hello.instanceId &&
    (await verifyTicket(
      instancePublicKey,
      hello.instanceId,
      hello.deviceId,
      devicePublicKey,
      hello.ticket,
      now,
    ));
  if (!ticketValid) {
    return { code: "bad_ticket", message: "the device ticket is not valid for this instance" };
  }
  const signed = await ed25519Verify(
    devicePublicKey,
    fromBase64Url(hello.signature),
    deviceChallenge(nonce, hello.instanceId, hello.deviceId),
  );
  return signed ? null : { code: "bad_signature", message: "the device did not prove its key" };
}
