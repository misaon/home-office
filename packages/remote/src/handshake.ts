import type { SecureFrame } from "@ho/protocol";
import {
  type Bytes,
  concat,
  equalBytes,
  fromBase64Url,
  randomBytes,
  toBase64Url,
  uint64,
  utf8,
} from "./bytes.ts";
import {
  aesGcmKey,
  aesGcmOpen,
  aesGcmSeal,
  generateX25519,
  hkdf,
  hmacSha256,
  x25519,
} from "./crypto.ts";

const LABEL = utf8("ho-remote v1");
const NONCE_BYTES = 12;
const KEY_BYTES = 32;
const DEVICE_TO_INSTANCE = 1;
const INSTANCE_TO_DEVICE = 2;

type Direction = typeof DEVICE_TO_INSTANCE | typeof INSTANCE_TO_DEVICE;

export type SecureChannel = {
  seal: (plaintext: Bytes, deliver: (frame: SecureFrame) => void) => Promise<void>;
  open: (frame: SecureFrame) => Promise<Bytes>;
};

export type HandshakeInputs = { psk: Bytes; instanceId: string; peerId: string };

type DerivedKeys = { deviceToInstance: Bytes; instanceToDevice: Bytes; mac: Bytes };

const nonceFor = (direction: Direction, counter: number): Bytes => {
  const nonce = new Uint8Array(NONCE_BYTES);
  nonce[0] = direction;
  nonce.set(uint64(counter), 4);
  return nonce;
};

async function createSecureChannel(
  keys: { send: Bytes; receive: Bytes },
  sendDirection: Direction,
): Promise<SecureChannel> {
  const sendKey = await aesGcmKey(keys.send);
  const receiveKey = await aesGcmKey(keys.receive);
  const receiveDirection =
    sendDirection === DEVICE_TO_INSTANCE ? INSTANCE_TO_DEVICE : DEVICE_TO_INSTANCE;
  let sent = 0;
  let received = 0;
  let outbox: Promise<void> = Promise.resolve();
  return {
    seal: (plaintext, deliver) => {
      sent += 1;
      const counter = sent;
      const nonce = nonceFor(sendDirection, counter);
      outbox = outbox.then(async () => {
        deliver({
          k: "d",
          c: counter,
          p: toBase64Url(await aesGcmSeal(sendKey, nonce, nonce, plaintext)),
        });
      });
      return outbox;
    },
    open: async (frame) => {
      if (frame.k !== "d") {
        throw new Error(`expected a data frame, got ${frame.k}`);
      }
      if (frame.c !== received + 1) {
        throw new Error(`frame ${String(frame.c)} arrived out of order`);
      }
      received = frame.c;
      const nonce = nonceFor(receiveDirection, frame.c);
      return aesGcmOpen(receiveKey, nonce, nonce, fromBase64Url(frame.p));
    },
  };
}

const transcriptOf = (
  inputs: HandshakeInputs,
  deviceEphemeral: Bytes,
  instanceEphemeral: Bytes,
  deviceNonce: Bytes,
  instanceNonce: Bytes,
): Bytes =>
  concat(
    utf8(inputs.instanceId),
    utf8(inputs.peerId),
    deviceEphemeral,
    instanceEphemeral,
    deviceNonce,
    instanceNonce,
  );

const deriveKeys = async (
  inputs: HandshakeInputs,
  shared: Bytes,
  transcript: Bytes,
): Promise<DerivedKeys> => {
  const material = await hkdf(concat(inputs.psk, shared), LABEL, transcript, KEY_BYTES * 3);
  return {
    deviceToInstance: material.slice(0, KEY_BYTES),
    instanceToDevice: material.slice(KEY_BYTES, KEY_BYTES * 2),
    mac: material.slice(KEY_BYTES * 2, KEY_BYTES * 3),
  };
};

const proof = (keys: DerivedKeys, step: "hs2" | "hs3", transcript: Bytes): Promise<Bytes> =>
  hmacSha256(keys.mac, concat(utf8(step), transcript));

export type Initiation = {
  hs1: SecureFrame;
  finish: (hs2: SecureFrame) => Promise<{ hs3: SecureFrame; channel: SecureChannel }>;
};

export async function initiateHandshake(inputs: HandshakeInputs): Promise<Initiation> {
  const ephemeral = await generateX25519();
  const deviceNonce = randomBytes(16);
  return {
    hs1: { k: "hs1", e: toBase64Url(ephemeral.publicKey), n: toBase64Url(deviceNonce) },
    finish: async (hs2) => {
      if (hs2.k !== "hs2") {
        throw new Error(`expected hs2, got ${hs2.k}`);
      }
      const instanceEphemeral = fromBase64Url(hs2.e);
      const transcript = transcriptOf(
        inputs,
        ephemeral.publicKey,
        instanceEphemeral,
        deviceNonce,
        fromBase64Url(hs2.n),
      );
      const keys = await deriveKeys(
        inputs,
        await x25519(ephemeral.privateKey, instanceEphemeral),
        transcript,
      );
      if (!equalBytes(await proof(keys, "hs2", transcript), fromBase64Url(hs2.m))) {
        throw new Error("the instance did not prove the pairing secret");
      }
      return {
        hs3: { k: "hs3", m: toBase64Url(await proof(keys, "hs3", transcript)) },
        channel: await createSecureChannel(
          { send: keys.deviceToInstance, receive: keys.instanceToDevice },
          DEVICE_TO_INSTANCE,
        ),
      };
    },
  };
}

export type Response = {
  hs2: SecureFrame;
  verify: (hs3: SecureFrame) => Promise<SecureChannel>;
};

export async function respondHandshake(
  inputs: HandshakeInputs,
  hs1: SecureFrame,
): Promise<Response> {
  if (hs1.k !== "hs1") {
    throw new Error(`expected hs1, got ${hs1.k}`);
  }
  const deviceEphemeral = fromBase64Url(hs1.e);
  const ephemeral = await generateX25519();
  const instanceNonce = randomBytes(16);
  const transcript = transcriptOf(
    inputs,
    deviceEphemeral,
    ephemeral.publicKey,
    fromBase64Url(hs1.n),
    instanceNonce,
  );
  const keys = await deriveKeys(
    inputs,
    await x25519(ephemeral.privateKey, deviceEphemeral),
    transcript,
  );
  return {
    hs2: {
      k: "hs2",
      e: toBase64Url(ephemeral.publicKey),
      n: toBase64Url(instanceNonce),
      m: toBase64Url(await proof(keys, "hs2", transcript)),
    },
    verify: async (hs3) => {
      if (hs3.k !== "hs3") {
        throw new Error(`expected hs3, got ${hs3.k}`);
      }
      if (!equalBytes(await proof(keys, "hs3", transcript), fromBase64Url(hs3.m))) {
        throw new Error("the device did not prove the pairing secret");
      }
      return createSecureChannel(
        { send: keys.instanceToDevice, receive: keys.deviceToInstance },
        INSTANCE_TO_DEVICE,
      );
    },
  };
}
