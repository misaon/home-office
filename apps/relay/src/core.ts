import {
  errorMessage,
  InstanceToRelay,
  PeerToRelay,
  RELAY_FRAMES_PER_WINDOW,
  RELAY_MAX_DEVICES,
  RELAY_MAX_FRAME_BYTES,
  RELAY_MAX_PAIRINGS,
  RELAY_WINDOW_MS,
  RelayHello,
} from "@ho/protocol";
import { randomBytes, toBase64Url } from "@ho/remote";
import { checkDeviceHello, checkInstanceHello, type Refusal } from "./hello.ts";
import {
  CLOSE_GOING_AWAY,
  CLOSE_NORMAL,
  CLOSE_POLICY,
  type Connection,
  type Instance,
  type Peer,
  type RelayLog,
  type RelaySocket,
  send,
} from "./state.ts";

const NONCE_BYTES = 32;

export class RelayCore {
  readonly #connections = new Map<RelaySocket, Connection>();
  readonly #instances = new Map<string, Instance>();
  readonly #log: RelayLog;
  readonly #now: () => number;

  constructor(log: RelayLog, now: () => number = () => Date.now()) {
    this.#log = log;
    this.#now = now;
  }

  get instances(): number {
    return this.#instances.size;
  }

  open(socket: RelaySocket): void {
    const nonce = randomBytes(NONCE_BYTES);
    this.#connections.set(socket, {
      nonce,
      role: { kind: "pending" },
      windowStart: this.#now(),
      frames: 0,
    });
    send(socket, { t: "challenge", nonce: toBase64Url(nonce) });
  }

  async message(socket: RelaySocket, raw: string): Promise<void> {
    const connection = this.#connections.get(socket);
    if (connection === undefined) {
      return;
    }
    if (raw.length > RELAY_MAX_FRAME_BYTES) {
      this.#refuse(socket, { code: "frame_too_large", message: "frames are limited to 1 MiB" });
      return;
    }
    if (!this.#withinRate(connection)) {
      this.#refuse(socket, { code: "rate_limited", message: "too many frames" });
      return;
    }
    try {
      await this.#dispatch(socket, connection, JSON.parse(raw));
    } catch (error) {
      this.#refuse(socket, { code: "protocol", message: errorMessage(error) });
    }
  }

  close(socket: RelaySocket): void {
    const connection = this.#connections.get(socket);
    this.#connections.delete(socket);
    if (connection === undefined) {
      return;
    }
    const { role } = connection;
    if (role.kind === "instance") {
      this.#instanceLeft(role.id, socket);
    } else if (role.kind === "peer") {
      this.#peerLeft(role.instanceId, role.peerId, socket);
    }
  }

  #instanceLeft(instanceId: string, socket: RelaySocket): void {
    const instance = this.#instances.get(instanceId);
    if (instance?.socket !== socket) {
      return;
    }
    this.#instances.delete(instanceId);
    for (const peer of instance.peers.values()) {
      send(peer.socket, { t: "instance_offline" });
      peer.socket.close(CLOSE_GOING_AWAY, "instance offline");
    }
    this.#log.info({ instanceId, peers: instance.peers.size }, "instance disconnected");
  }

  #peerLeft(instanceId: string, peerId: string, socket: RelaySocket): void {
    const instance = this.#instances.get(instanceId);
    const peer = instance?.peers.get(peerId);
    if (instance !== undefined && peer?.socket === socket) {
      instance.peers.delete(peerId);
      send(instance.socket, { t: "peer_closed", peer: peerId });
    }
  }

  #withinRate(connection: Connection): boolean {
    const now = this.#now();
    if (now - connection.windowStart > RELAY_WINDOW_MS) {
      connection.windowStart = now;
      connection.frames = 0;
    }
    connection.frames += 1;
    return connection.frames <= RELAY_FRAMES_PER_WINDOW;
  }

  #refuse(socket: RelaySocket, refusal: Refusal): void {
    const role = this.#connections.get(socket)?.role.kind;
    this.#log.warn({ code: refusal.code, role }, "relay refused a frame");
    send(socket, { t: "error", code: refusal.code, message: refusal.message });
    socket.close(CLOSE_POLICY, refusal.code);
  }

  async #dispatch(socket: RelaySocket, connection: Connection, json: unknown): Promise<void> {
    const { role } = connection;
    if (role.kind === "pending") {
      await this.#hello(socket, connection, json);
    } else if (role.kind === "instance") {
      this.#fromInstance(socket, role.id, json);
    } else {
      this.#fromPeer(socket, role, json);
    }
  }

  async #hello(socket: RelaySocket, connection: Connection, json: unknown): Promise<void> {
    const parsed = RelayHello.safeParse(json);
    if (!parsed.success) {
      this.#refuse(socket, {
        code: "bad_hello",
        message: "the first frame must introduce the connection",
      });
      return;
    }
    const hello = parsed.data;
    if (hello.t === "instance") {
      const refusal = await checkInstanceHello(hello, connection.nonce);
      if (refusal !== null) {
        this.#refuse(socket, refusal);
        return;
      }
      this.#instances
        .get(hello.instanceId)
        ?.socket.close(CLOSE_NORMAL, "replaced by a newer connection");
      this.#instances.set(hello.instanceId, {
        id: hello.instanceId,
        socket,
        revoked: new Set(hello.revoked),
        pairings: new Map(hello.pairings.map((pairing) => [pairing.id, Date.parse(pairing.until)])),
        peers: new Map(),
      });
      connection.role = { kind: "instance", id: hello.instanceId };
      send(socket, { t: "welcome", role: "instance" });
      this.#log.info({ instanceId: hello.instanceId }, "instance connected");
      return;
    }
    const instance = this.#instances.get(hello.instanceId);
    if (hello.t === "device") {
      const refusal = await checkDeviceHello(hello, connection.nonce, this.#now());
      if (refusal !== null) {
        this.#refuse(socket, refusal);
        return;
      }
      if (instance === undefined) {
        this.#refuse(socket, { code: "instance_offline", message: "the office is not connected" });
        return;
      }
      if (instance.revoked.has(hello.deviceId)) {
        this.#refuse(socket, { code: "revoked", message: "this device was revoked" });
        return;
      }
      this.#admit(socket, connection, instance, { id: hello.deviceId, kind: "device", socket });
      return;
    }
    if (instance === undefined) {
      this.#refuse(socket, { code: "instance_offline", message: "the office is not connected" });
      return;
    }
    const until = instance.pairings.get(hello.pairingId);
    if (until === undefined || until < this.#now()) {
      this.#refuse(socket, { code: "unknown_pairing", message: "no such pairing is open" });
      return;
    }
    this.#admit(socket, connection, instance, { id: hello.pairingId, kind: "pairing", socket });
  }

  #admit(socket: RelaySocket, connection: Connection, instance: Instance, peer: Peer): void {
    const limit = peer.kind === "device" ? RELAY_MAX_DEVICES : RELAY_MAX_PAIRINGS;
    const alike = [...instance.peers.values()].filter((other) => other.kind === peer.kind).length;
    if (alike >= limit) {
      this.#refuse(socket, {
        code: "too_many_peers",
        message: `at most ${String(limit)} ${peer.kind} connections`,
      });
      return;
    }
    instance.peers.get(peer.id)?.socket.close(CLOSE_NORMAL, "replaced by a newer connection");
    instance.peers.set(peer.id, peer);
    connection.role = { kind: "peer", instanceId: instance.id, peerId: peer.id };
    send(socket, { t: "welcome", role: peer.kind });
    send(instance.socket, { t: "peer_open", peer: peer.id, kind: peer.kind });
    this.#log.info({ instanceId: instance.id, peer: peer.id, kind: peer.kind }, "peer connected");
  }

  #fromInstance(socket: RelaySocket, instanceId: string, json: unknown): void {
    const instance = this.#instances.get(instanceId);
    if (instance === undefined || instance.socket !== socket) {
      return;
    }
    const parsed = InstanceToRelay.safeParse(json);
    if (!parsed.success) {
      this.#refuse(socket, { code: "protocol", message: "unknown frame from the instance" });
      return;
    }
    const frame = parsed.data;
    switch (frame.t) {
      case "to": {
        const peer = instance.peers.get(frame.peer);
        if (peer !== undefined) {
          send(peer.socket, { t: "data", data: frame.data });
        }
        break;
      }
      case "pairing_open": {
        instance.pairings.set(frame.id, Date.parse(frame.until));
        break;
      }
      case "pairing_closed": {
        instance.pairings.delete(frame.id);
        instance.peers.get(frame.id)?.socket.close(CLOSE_NORMAL, "pairing closed");
        break;
      }
      case "revoke": {
        instance.revoked.add(frame.deviceId);
        instance.peers.get(frame.deviceId)?.socket.close(CLOSE_POLICY, "revoked");
        break;
      }
    }
  }

  #fromPeer(
    socket: RelaySocket,
    role: { instanceId: string; peerId: string },
    json: unknown,
  ): void {
    const parsed = PeerToRelay.safeParse(json);
    if (!parsed.success) {
      this.#refuse(socket, { code: "protocol", message: "unknown frame from the peer" });
      return;
    }
    const instance = this.#instances.get(role.instanceId);
    const peer = instance?.peers.get(role.peerId);
    if (instance === undefined || peer?.socket !== socket) {
      this.#refuse(socket, { code: "instance_offline", message: "the office is not connected" });
      return;
    }
    send(instance.socket, {
      t: "from",
      peer: role.peerId,
      kind: peer.kind,
      data: parsed.data.data,
    });
  }
}
