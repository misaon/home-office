import {
  type Contract,
  type DeviceTicket,
  REMOTE_PROTOCOL_VERSION,
  RemoteMessage,
  SecureFrame,
} from "@ho/protocol";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { ContractRouterClient } from "@orpc/contract";
import { type Bytes, fromBase64Url, textOf, toBase64Url, utf8 } from "./bytes.ts";
import {
  type Ed25519Jwk,
  ed25519Sign,
  exportEd25519Private,
  generateEd25519,
  importEd25519Private,
} from "./crypto.ts";
import { type HandshakeInputs, initiateHandshake, type SecureChannel } from "./handshake.ts";
import { pairingOf, parsePairingCode } from "./pairing.ts";
import { openRelay, type RelaySession, type WebSocketFactory } from "./relay-client.ts";
import { deviceChallenge } from "./ticket.ts";
import { TunnelSocket } from "./tunnel-socket.ts";

type RemoteClient = ContractRouterClient<Contract>;

type DeviceCredentials = {
  instanceId: string;
  instancePublicKey: string;
  deviceId: string;
  devicePublicKey: string;
  devicePrivateKey: Ed25519Jwk;
  secret: string;
  ticket: DeviceTicket;
};

type RemoteConnection = { client: RemoteClient; close: () => void; closed: Promise<void> };

type Transport = { relayUrl: string; webSocket?: WebSocketFactory };

const parseFrame = (data: string): SecureFrame => SecureFrame.parse(JSON.parse(data));

const parseMessage = (plaintext: Bytes): RemoteMessage =>
  RemoteMessage.parse(JSON.parse(textOf(plaintext)));

async function nextFrame(relay: RelaySession): Promise<SecureFrame> {
  for (;;) {
    const frame = await relay.next();
    if (frame.t === "data") {
      return parseFrame(frame.data);
    }
    if (frame.t === "instance_offline") {
      throw new Error("the office is offline");
    }
  }
}

async function handshakeOver(relay: RelaySession, inputs: HandshakeInputs): Promise<SecureChannel> {
  const initiation = await initiateHandshake(inputs);
  relay.send({ t: "data", data: JSON.stringify(initiation.hs1) });
  const finished = await initiation.finish(await nextFrame(relay));
  relay.send({ t: "data", data: JSON.stringify(finished.hs3) });
  return finished.channel;
}

const sendMessage = (
  relay: RelaySession,
  channel: SecureChannel,
  message: RemoteMessage,
): Promise<void> =>
  channel.seal(utf8(JSON.stringify(message)), (frame) => {
    relay.send({ t: "data", data: JSON.stringify(frame) });
  });

const receiveMessage = async (
  relay: RelaySession,
  channel: SecureChannel,
): Promise<RemoteMessage> => parseMessage(await channel.open(await nextFrame(relay)));

export async function pairDevice(
  options: Transport & { code: string; name: string },
): Promise<DeviceCredentials> {
  const { instanceId, secret } = parsePairingCode(options.code);
  const pairing = await pairingOf(instanceId, secret);
  const deviceKey = await generateEd25519(true);
  const relay = await openRelay(
    options.relayUrl,
    () =>
      Promise.resolve({
        t: "pairing",
        v: REMOTE_PROTOCOL_VERSION,
        instanceId,
        pairingId: pairing.pairingId,
      }),
    options.webSocket,
  );
  try {
    const channel = await handshakeOver(relay, {
      psk: pairing.psk,
      instanceId,
      peerId: pairing.pairingId,
    });
    await sendMessage(relay, channel, {
      a: "enroll_request",
      publicKey: toBase64Url(deviceKey.publicKey),
      name: options.name,
    });
    const reply = await receiveMessage(relay, channel);
    if (reply.a === "refused") {
      throw new Error(`the office refused the pairing: ${reply.reason}`);
    }
    if (reply.a !== "enrolled") {
      throw new Error("the office answered the pairing with something unexpected");
    }
    return {
      instanceId,
      instancePublicKey: reply.instancePublicKey,
      deviceId: reply.deviceId,
      devicePublicKey: toBase64Url(deviceKey.publicKey),
      devicePrivateKey: await exportEd25519Private(deviceKey.privateKey),
      secret: reply.secret,
      ticket: reply.ticket,
    };
  } finally {
    relay.close();
  }
}

async function pump(
  relay: RelaySession,
  channel: SecureChannel,
  tunnel: TunnelSocket,
): Promise<void> {
  for (;;) {
    const message = await receiveMessage(relay, channel);
    if (message.a === "rpc") {
      tunnel.receive(message.m);
    }
  }
}

export async function connectDevice(
  options: Transport & { credentials: DeviceCredentials },
): Promise<RemoteConnection> {
  const { credentials } = options;
  const privateKey = await importEd25519Private(credentials.devicePrivateKey);
  const relay = await openRelay(
    options.relayUrl,
    async (nonce) => ({
      t: "device",
      v: REMOTE_PROTOCOL_VERSION,
      instanceId: credentials.instanceId,
      instancePublicKey: credentials.instancePublicKey,
      deviceId: credentials.deviceId,
      publicKey: credentials.devicePublicKey,
      ticket: credentials.ticket,
      signature: toBase64Url(
        await ed25519Sign(
          privateKey,
          deviceChallenge(nonce, credentials.instanceId, credentials.deviceId),
        ),
      ),
    }),
    options.webSocket,
  );
  const channel = await handshakeOver(relay, {
    psk: fromBase64Url(credentials.secret),
    instanceId: credentials.instanceId,
    peerId: credentials.deviceId,
  });
  const tunnel = new TunnelSocket((message) => {
    void sendMessage(relay, channel, { a: "rpc", m: message }).catch(() => {
      relay.close();
    });
  });
  void pump(relay, channel, tunnel)
    .catch(() => undefined)
    .finally(() => {
      tunnel.close();
      relay.close();
    });
  const client: RemoteClient = createORPCClient(new RPCLink({ websocket: tunnel }));
  return {
    client,
    close: () => {
      relay.close();
    },
    closed: relay.closed,
  };
}
