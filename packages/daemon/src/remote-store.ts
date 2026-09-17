import {
  Base64Url,
  DeviceTicket,
  IsoDateTime,
  type RemoteConfigureInput,
  RemoteId,
} from "@ho/protocol";
import {
  type Ed25519Jwk,
  exportEd25519Private,
  fromBase64Url,
  generateEd25519,
  importEd25519Private,
  instanceIdOf,
} from "@ho/remote";
import { writePrivateFile } from "@ho/secrets";
import { join } from "node:path";
import { z } from "zod";

const PrivateJwk = z.object({
  kty: z.literal("OKP"),
  crv: z.literal("Ed25519"),
  x: Base64Url,
  d: Base64Url,
});

const StoredDevice = z.object({
  id: RemoteId,
  name: z.string().min(1).max(60),
  publicKey: Base64Url,
  secret: Base64Url,
  ticket: DeviceTicket,
  pairedAt: IsoDateTime,
  lastSeenAt: IsoDateTime.nullable(),
  revokedAt: IsoDateTime.nullable(),
});
export type StoredDevice = z.infer<typeof StoredDevice>;

const RemoteState = z.object({
  enabled: z.boolean().default(false),
  relayUrl: z.string().nullable().default(null),
  instance: PrivateJwk.nullable().default(null),
  devices: z.array(StoredDevice).default([]),
});
type RemoteState = z.infer<typeof RemoteState>;

export type InstanceIdentity = { id: string; publicKey: string; privateKey: CryptoKey };

const FILE_NAME = "remote.json";

const identityOf = async (jwk: Ed25519Jwk): Promise<InstanceIdentity> => ({
  id: await instanceIdOf(fromBase64Url(jwk.x)),
  publicKey: jwk.x,
  privateKey: await importEd25519Private(jwk),
});

export class RemoteStore {
  readonly #path: string;
  #state: RemoteState;
  #identity: InstanceIdentity | null;
  #writes: Promise<void> = Promise.resolve();

  constructor(path: string, state: RemoteState, identity: InstanceIdentity | null) {
    this.#path = path;
    this.#state = state;
    this.#identity = identity;
  }

  static async open(home: string): Promise<RemoteStore> {
    const path = join(home, FILE_NAME);
    const file = Bun.file(path);
    const state = RemoteState.parse((await file.exists()) ? await file.json() : {});
    const identity = state.instance === null ? null : await identityOf(state.instance);
    return new RemoteStore(path, state, identity);
  }

  get enabled(): boolean {
    return this.#state.enabled;
  }

  get relayUrl(): string | null {
    return this.#state.relayUrl;
  }

  get devices(): readonly StoredDevice[] {
    return this.#state.devices;
  }

  get identity(): InstanceIdentity | null {
    return this.#identity;
  }

  device(id: string): StoredDevice | undefined {
    return this.#state.devices.find((device) => device.id === id);
  }

  async ensureIdentity(): Promise<InstanceIdentity> {
    if (this.#identity !== null) {
      return this.#identity;
    }
    const pair = await generateEd25519(true);
    const jwk = await exportEd25519Private(pair.privateKey);
    const identity = await identityOf(jwk);
    await this.#save((state) => ({ ...state, instance: jwk }));
    this.#identity = identity;
    return identity;
  }

  configure(input: RemoteConfigureInput): Promise<void> {
    return this.#save((state) => ({
      ...state,
      enabled: input.enabled ?? state.enabled,
      relayUrl: input.relayUrl === undefined ? state.relayUrl : input.relayUrl,
    }));
  }

  addDevice(device: StoredDevice): Promise<void> {
    return this.#save((state) => ({ ...state, devices: [...state.devices, device] }));
  }

  async revokeDevice(id: string, at: string): Promise<StoredDevice | null> {
    const device = this.device(id);
    if (device === undefined) {
      return null;
    }
    const revoked = { ...device, revokedAt: device.revokedAt ?? at };
    await this.#patchDevice(revoked);
    return revoked;
  }

  touchDevice(id: string, at: string): Promise<void> {
    const device = this.device(id);
    return device === undefined
      ? Promise.resolve()
      : this.#patchDevice({ ...device, lastSeenAt: at });
  }

  #patchDevice(device: StoredDevice): Promise<void> {
    return this.#save((state) => ({
      ...state,
      devices: state.devices.map((known) => (known.id === device.id ? device : known)),
    }));
  }

  async #save(mutate: (state: RemoteState) => RemoteState): Promise<void> {
    const turn = this.#writes;
    const done = Promise.withResolvers<void>();
    this.#writes = done.promise;
    try {
      await turn;
      const next = mutate(this.#state);
      await writePrivateFile(this.#path, `${JSON.stringify(next, null, 2)}\n`);
      this.#state = next;
    } finally {
      done.resolve();
    }
  }
}
