import type { Clock } from "@ho/core";
import {
  conflict,
  errorMessage,
  notFound,
  RELAY_MAX_PAIRINGS,
  type RelayHello,
  type RelayToClient,
  REMOTE_PROTOCOL_VERSION,
  type RemoteConfigureInput,
  type RemotePairing,
  type RemoteStatus,
} from "@ho/protocol";
import {
  type Bytes,
  ed25519Sign,
  instanceChallenge,
  openRelay,
  type RelaySession,
  toBase64Url,
} from "@ho/remote";
import { DomainFailureError } from "./domain-failure.ts";
import type { Logger } from "./logger.ts";
import { PairingBook } from "./remote-pairings.ts";
import { PeerTable } from "./remote-peer-table.ts";
import type { RemoteDispatcher } from "./remote-peers.ts";
import { type InstanceIdentity, RemoteStore } from "./remote-store.ts";

const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

const transportSecure = (relayUrl: string): boolean => {
  const url = new URL(relayUrl);
  return url.protocol === "wss:" || LOOPBACK_HOSTS.has(url.hostname);
};

export class RemoteService {
  readonly #store: RemoteStore;
  readonly #clock: Clock;
  readonly #log: Logger;
  readonly #pairings: PairingBook;
  readonly #peers: PeerTable;
  #dispatcher: RemoteDispatcher | null = null;
  #relay: RelaySession | null = null;
  #connectedAt: string | null = null;
  #lastError: string | null = null;
  #retryMs = FIRST_RETRY_MS;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #generation = 0;
  #stopped = false;

  constructor(store: RemoteStore, clock: Clock, log: Logger) {
    this.#store = store;
    this.#clock = clock;
    this.#log = log;
    this.#pairings = new PairingBook((id) => {
      this.#pairingGone(id, "expired");
    });
    this.#peers = new PeerTable({
      store,
      pairings: this.#pairings,
      clock,
      log,
      transmit: (frame) => {
        this.#relay?.send(frame);
      },
      dispatcher: () => this.#dispatcher,
      onEnrolled: (id) => {
        this.#closePairing(id, "used");
      },
    });
  }

  static async open(home: string, clock: Clock, log: Logger): Promise<RemoteService> {
    return new RemoteService(await RemoteStore.open(home), clock, log);
  }

  attach(dispatcher: RemoteDispatcher): void {
    this.#dispatcher = dispatcher;
    this.#schedule(0);
  }

  status(): RemoteStatus {
    return {
      enabled: this.#store.enabled,
      relayUrl: this.#store.relayUrl,
      instanceId: this.#store.identity?.id ?? null,
      connected: this.#relay !== null,
      connectedAt: this.#connectedAt,
      lastError: this.#lastError,
      devices: this.#store.devices.map((device) => ({
        id: device.id,
        name: device.name,
        publicKey: device.publicKey,
        pairedAt: device.pairedAt,
        lastSeenAt: device.lastSeenAt,
        revokedAt: device.revokedAt,
        online: this.#peers.online(device.id),
      })),
      pairings: this.#pairings.list(),
    };
  }

  async configure(input: RemoteConfigureInput): Promise<RemoteStatus> {
    await this.#store.configure(input);
    if (this.#store.enabled && this.#store.relayUrl !== null) {
      await this.#store.ensureIdentity();
    }
    this.#log.info(
      { enabled: this.#store.enabled, relayUrl: this.#store.relayUrl },
      "remote control configured",
    );
    if (this.#store.relayUrl !== null && !transportSecure(this.#store.relayUrl)) {
      this.#log.warn(
        { relayUrl: this.#store.relayUrl },
        "the relay url is plain ws; use wss for any relay outside this machine",
      );
    }
    this.#restart();
    return this.status();
  }

  async pair(name: string): Promise<RemotePairing> {
    if (!this.#store.enabled || this.#store.relayUrl === null) {
      throw new DomainFailureError(
        conflict("remote control is off; run `ho remote on --relay <url>` first"),
      );
    }
    if (this.#pairings.size >= RELAY_MAX_PAIRINGS) {
      throw new DomainFailureError(
        conflict(`at most ${String(RELAY_MAX_PAIRINGS)} pairings can be open at once`),
      );
    }
    const identity = await this.#store.ensureIdentity();
    const opened = await this.#pairings.open(identity, name, this.#clock.now());
    this.#relay?.send({ t: "pairing_open", id: opened.id, until: opened.expiresAt });
    this.#log.info({ pairingId: opened.id, name, expiresAt: opened.expiresAt }, "pairing opened");
    return {
      code: opened.code,
      instanceId: identity.id,
      expiresAt: opened.expiresAt,
      relayUrl: this.#store.relayUrl,
    };
  }

  async revoke(deviceId: string): Promise<RemoteStatus> {
    const revoked = await this.#store.revokeDevice(deviceId, this.#clock.now().toISOString());
    if (revoked === null) {
      throw new DomainFailureError(notFound("device", deviceId));
    }
    this.#relay?.send({ t: "revoke", deviceId });
    this.#peers.close(deviceId, "revoked");
    this.#log.info({ deviceId, name: revoked.name }, "remote device revoked");
    return this.status();
  }

  stop(): void {
    this.#stopped = true;
    this.#generation += 1;
    this.#clearRetry();
    this.#pairings.clear();
    this.#disconnect("daemon stopping");
  }

  #closePairing(id: string, reason: string): void {
    if (this.#pairings.remove(id)) {
      this.#pairingGone(id, reason);
    }
  }

  #pairingGone(id: string, reason: string): void {
    this.#relay?.send({ t: "pairing_closed", id });
    this.#peers.close(id, reason);
    this.#log.info({ pairingId: id, reason }, "pairing closed");
  }

  #restart(): void {
    this.#generation += 1;
    this.#retryMs = FIRST_RETRY_MS;
    this.#lastError = null;
    this.#disconnect("remote control reconfigured");
    this.#schedule(0);
  }

  #disconnect(reason: string): void {
    this.#peers.closeAll(reason);
    this.#relay?.close();
    this.#relay = null;
    this.#connectedAt = null;
  }

  #clearRetry(): void {
    if (this.#retry !== null) {
      clearTimeout(this.#retry);
      this.#retry = null;
    }
  }

  #schedule(delayMs: number): void {
    this.#clearRetry();
    if (
      this.#stopped ||
      this.#dispatcher === null ||
      !this.#store.enabled ||
      this.#store.relayUrl === null
    ) {
      return;
    }
    this.#retry = setTimeout(() => {
      this.#retry = null;
      void this.#connect();
    }, delayMs);
  }

  async #connect(): Promise<void> {
    this.#generation += 1;
    const generation = this.#generation;
    const { relayUrl } = this.#store;
    if (relayUrl === null) {
      return;
    }
    try {
      const identity = await this.#store.ensureIdentity();
      const relay = await openRelay(relayUrl, (nonce) => this.#hello(identity, nonce));
      if (generation !== this.#generation) {
        relay.close();
        return;
      }
      this.#relay = relay;
      this.#connectedAt = this.#clock.now().toISOString();
      this.#lastError = null;
      this.#retryMs = FIRST_RETRY_MS;
      this.#log.info({ relayUrl, instanceId: identity.id }, "relay connected");
      await this.#pump(relay);
    } catch (error) {
      if (generation === this.#generation) {
        this.#lastError = errorMessage(error);
        this.#log.warn(
          { relayUrl, err: this.#lastError, retryMs: this.#retryMs },
          "relay connection lost",
        );
      }
    } finally {
      if (generation === this.#generation) {
        this.#disconnect("relay disconnected");
        this.#schedule(this.#retryMs);
        this.#retryMs = Math.min(this.#retryMs * 2, MAX_RETRY_MS);
      }
    }
  }

  async #hello(identity: InstanceIdentity, nonce: Bytes): Promise<RelayHello> {
    return {
      t: "instance",
      v: REMOTE_PROTOCOL_VERSION,
      instanceId: identity.id,
      publicKey: identity.publicKey,
      signature: toBase64Url(
        await ed25519Sign(identity.privateKey, instanceChallenge(nonce, identity.id)),
      ),
      revoked: this.#store.devices
        .filter((device) => device.revokedAt !== null)
        .map((device) => device.id),
      pairings: this.#pairings.windows(),
    };
  }

  async #pump(relay: RelaySession): Promise<void> {
    for (;;) {
      this.#handle(await relay.next());
    }
  }

  #handle(frame: RelayToClient): void {
    switch (frame.t) {
      case "peer_open": {
        this.#peers.open(frame.peer, frame.kind);
        break;
      }
      case "from": {
        this.#peers.receive(frame.peer, frame.kind, frame.data);
        break;
      }
      case "peer_closed": {
        this.#peers.close(frame.peer, "peer left");
        break;
      }
      case "challenge":
      case "welcome":
      case "data":
      case "instance_offline":
      case "error": {
        this.#log.debug({ frame: frame.t }, "unexpected relay frame");
        break;
      }
    }
  }
}
