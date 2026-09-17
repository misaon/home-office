import { PAIRING_TTL_MS } from "@ho/protocol";
import { type Bytes, formatPairingCode, newPairingSecret, pairingOf } from "@ho/remote";
import type { InstanceIdentity } from "./remote-store.ts";

export type OpenPairing = { id: string; name: string; psk: Bytes; expiresAt: string };

type Pairing = OpenPairing & { timer: ReturnType<typeof setTimeout> };

export type PairingWindow = { id: string; until: string };

export class PairingBook {
  readonly #pairings = new Map<string, Pairing>();
  readonly #onExpired: (id: string) => void;

  constructor(onExpired: (id: string) => void) {
    this.#onExpired = onExpired;
  }

  get size(): number {
    return this.#pairings.size;
  }

  get(id: string): OpenPairing | undefined {
    return this.#pairings.get(id);
  }

  list(): { id: string; name: string; expiresAt: string }[] {
    return [...this.#pairings.values()].map((pairing) => ({
      id: pairing.id,
      name: pairing.name,
      expiresAt: pairing.expiresAt,
    }));
  }

  windows(): PairingWindow[] {
    return [...this.#pairings.values()].map((pairing) => ({
      id: pairing.id,
      until: pairing.expiresAt,
    }));
  }

  async open(
    identity: InstanceIdentity,
    name: string,
    now: Date,
  ): Promise<{ id: string; code: string; expiresAt: string }> {
    const secret = newPairingSecret();
    const { pairingId, psk } = await pairingOf(identity.id, secret);
    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS).toISOString();
    this.#pairings.set(pairingId, {
      id: pairingId,
      name,
      psk,
      expiresAt,
      timer: setTimeout(() => {
        this.#pairings.delete(pairingId);
        this.#onExpired(pairingId);
      }, PAIRING_TTL_MS),
    });
    return { id: pairingId, code: formatPairingCode(identity.id, secret), expiresAt };
  }

  remove(id: string): boolean {
    const pairing = this.#pairings.get(id);
    if (pairing === undefined) {
      return false;
    }
    clearTimeout(pairing.timer);
    this.#pairings.delete(id);
    return true;
  }

  clear(): void {
    for (const pairing of this.#pairings.values()) {
      clearTimeout(pairing.timer);
    }
    this.#pairings.clear();
  }
}
