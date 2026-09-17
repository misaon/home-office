import type { Clock } from "@ho/core";
import {
  DEVICE_TICKET_TTL_MS,
  errorMessage,
  type InstanceToRelay,
  type RemoteMessage,
} from "@ho/protocol";
import {
  fromBase64Url,
  type HandshakeInputs,
  issueTicket,
  newRemoteId,
  randomBytes,
  toBase64Url,
} from "@ho/remote";
import type { Logger } from "./logger.ts";
import type { PairingBook } from "./remote-pairings.ts";
import {
  type RemoteCaller,
  type RemoteDispatcher,
  type RemoteSocket,
  SecurePeer,
} from "./remote-peers.ts";
import type { RemoteStore, StoredDevice } from "./remote-store.ts";

export type PeerKind = "device" | "pairing";

type Peer = {
  id: string;
  kind: PeerKind;
  socket: RemoteSocket;
  secure: SecurePeer;
  caller: RemoteCaller | null;
};

export type PeerTableDeps = {
  store: RemoteStore;
  pairings: PairingBook;
  clock: Clock;
  log: Logger;
  transmit: (frame: InstanceToRelay) => void;
  dispatcher: () => RemoteDispatcher | null;
  onEnrolled: (pairingId: string) => void;
};

const SECRET_BYTES = 32;
const decoder = new TextDecoder();

const textOf = (data: string | ArrayBufferLike | Uint8Array): string =>
  typeof data === "string"
    ? data
    : decoder.decode(data instanceof Uint8Array ? data : new Uint8Array(data));

export class PeerTable {
  readonly #deps: PeerTableDeps;
  readonly #peers = new Map<string, Peer>();

  constructor(deps: PeerTableDeps) {
    this.#deps = deps;
  }

  online(deviceId: string): boolean {
    const peer = this.#peers.get(deviceId);
    return peer !== undefined && peer.caller !== null;
  }

  receive(id: string, kind: PeerKind, data: string): void {
    const peer = this.#peers.get(id) ?? this.open(id, kind);
    peer?.secure.receive(data);
  }

  open(id: string, kind: PeerKind): Peer | null {
    if (this.#peers.has(id)) {
      this.close(id, "replaced");
    }
    const inputs = kind === "device" ? this.#deviceInputs(id) : this.#pairingInputs(id);
    if (inputs === null) {
      this.#deps.log.warn({ peer: id, kind }, "relay admitted a peer this office does not know");
      return null;
    }
    const peer: Peer = {
      id,
      kind,
      caller: null,
      socket: { send: (data) => this.#toPeer(id, textOf(data)) },
      secure: new SecurePeer({
        inputs,
        transmit: (data) => {
          this.#deps.transmit({ t: "to", peer: id, data });
        },
        onSecured: () => {
          this.#secured(id);
        },
        onMessage: (message) => this.#message(id, message),
        onFailure: (reason) => {
          this.close(id, reason);
        },
      }),
    };
    this.#peers.set(id, peer);
    this.#deps.log.debug({ peer: id, kind }, "remote peer opened");
    return peer;
  }

  close(id: string, reason: string): void {
    const peer = this.#peers.get(id);
    if (peer === undefined) {
      return;
    }
    this.#peers.delete(id);
    peer.secure.dispose();
    this.#deps.dispatcher()?.close(peer.socket);
    this.#deps.log.info({ peer: id, kind: peer.kind, reason }, "remote peer closed");
  }

  closeAll(reason: string): void {
    for (const id of this.#peers.keys()) {
      this.close(id, reason);
    }
  }

  #deviceInputs(id: string): HandshakeInputs | null {
    const device = this.#deps.store.device(id);
    const { identity } = this.#deps.store;
    if (device === undefined || device.revokedAt !== null || identity === null) {
      return null;
    }
    return { psk: fromBase64Url(device.secret), instanceId: identity.id, peerId: id };
  }

  #pairingInputs(id: string): HandshakeInputs | null {
    const pairing = this.#deps.pairings.get(id);
    const { identity } = this.#deps.store;
    return pairing === undefined || identity === null
      ? null
      : { psk: pairing.psk, instanceId: identity.id, peerId: id };
  }

  #toPeer(id: string, data: string): number {
    const peer = this.#peers.get(id);
    if (peer === undefined) {
      return 0;
    }
    void peer.secure.send({ a: "rpc", m: data }).catch((error: unknown) => {
      this.close(id, errorMessage(error));
    });
    return data.length;
  }

  #secured(id: string): void {
    const peer = this.#peers.get(id);
    if (peer === undefined) {
      return;
    }
    if (peer.kind === "pairing") {
      this.#deps.log.info({ pairingId: id }, "pairing peer secured");
      return;
    }
    const name = this.#deps.store.device(id)?.name ?? id;
    peer.caller = { id, name };
    void this.#deps.store
      .touchDevice(id, this.#deps.clock.now().toISOString())
      .catch((error: unknown) => {
        this.#deps.log.warn(
          { deviceId: id, err: errorMessage(error) },
          "device visit not recorded",
        );
      });
    this.#deps.log.info({ deviceId: id, name }, "remote device connected");
  }

  async #message(id: string, message: RemoteMessage): Promise<void> {
    const peer = this.#peers.get(id);
    if (peer === undefined) {
      return;
    }
    if (message.a === "rpc") {
      const dispatcher = this.#deps.dispatcher();
      if (peer.caller === null || dispatcher === null) {
        this.close(id, "rpc before enrollment");
        return;
      }
      void dispatcher.message(peer.socket, message.m, peer.caller).catch((error: unknown) => {
        this.#deps.log.warn(
          { deviceId: id, err: errorMessage(error) },
          "remote rpc dispatch failed",
        );
      });
      return;
    }
    if (message.a === "enroll_request" && peer.kind === "pairing") {
      await this.#enroll(peer, message.publicKey, message.name);
      return;
    }
    this.close(id, `unexpected ${message.a} message`);
  }

  async #enroll(peer: Peer, publicKey: string, reportedName: string): Promise<void> {
    const pairing = this.#deps.pairings.get(peer.id);
    if (pairing === undefined) {
      await peer.secure.send({ a: "refused", reason: "this pairing is no longer open" });
      this.close(peer.id, "pairing gone");
      return;
    }
    const identity = await this.#deps.store.ensureIdentity();
    const now = this.#deps.clock.now();
    const deviceId = newRemoteId();
    const device: StoredDevice = {
      id: deviceId,
      name: pairing.name,
      publicKey,
      secret: toBase64Url(randomBytes(SECRET_BYTES)),
      ticket: await issueTicket(
        identity.privateKey,
        identity.id,
        deviceId,
        fromBase64Url(publicKey),
        new Date(now.getTime() + DEVICE_TICKET_TTL_MS).toISOString(),
      ),
      pairedAt: now.toISOString(),
      lastSeenAt: null,
      revokedAt: null,
    };
    await this.#deps.store.addDevice(device);
    await peer.secure.send({
      a: "enrolled",
      deviceId,
      secret: device.secret,
      ticket: device.ticket,
      instancePublicKey: identity.publicKey,
    });
    this.#deps.log.info({ deviceId, name: device.name, reportedName }, "remote device paired");
    this.#deps.onEnrolled(pairing.id);
  }
}
