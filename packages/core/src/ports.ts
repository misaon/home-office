import type { NewEvent, StoredEvent } from "@ho/protocol";

/** Structural stand-in for AbortSignal so the core needs neither DOM nor Node typings. */
export type Cancellation = {
  readonly aborted: boolean;
  addEventListener: (type: "abort", listener: () => void) => void;
};

/** Time and randomness are injected so the core stays deterministic and browser-safe. */
export type Clock = { now: () => Date };
export type Randomness = { randomize: (bytes: Uint8Array) => void };

export type EventFilter = { types?: readonly StoredEvent["type"][] };

export type EventStore = {
  /** Appends atomically in order and returns the stored events with `seq`, `id` and `at` assigned. */
  append: (events: readonly NewEvent[]) => Promise<StoredEvent[]>;
  /** Reads stored events with `seq` greater than `afterSeq` (all when omitted), in order. */
  read: (afterSeq?: number, filter?: EventFilter) => AsyncIterable<StoredEvent>;
  /** Live events appended after subscription time. */
  subscribe: (filter?: EventFilter, signal?: Cancellation) => AsyncIterable<StoredEvent>;
  lastSeq: () => Promise<number>;
};

export type SecretKey =
  | "anthropic-oauth-token"
  | "anthropic-api-key"
  | "daemon-token"
  | (string & {});
export type SecretStore = {
  get: (key: SecretKey) => Promise<string | null>;
  set: (key: SecretKey, value: string) => Promise<void>;
  delete: (key: SecretKey) => Promise<void>;
};
