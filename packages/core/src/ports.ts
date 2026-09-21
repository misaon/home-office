import type {
  MailAck,
  MailConnector,
  MailItem,
  NewEvent,
  Project,
  SecretKeyName,
  StoredEvent,
} from "@ho/protocol";

export type Cancellation = {
  readonly aborted: boolean;
  addEventListener: (type: "abort", listener: () => void) => void;
  removeEventListener: (type: "abort", listener: () => void) => void;
};

export type Clock = { now: () => Date };
export type Randomness = { randomize: (bytes: Uint8Array) => void };

export type EventFilter = { types?: readonly StoredEvent["type"][] };

export type ReplayProblem = {
  seq: number;
  type: string;
  at: string;
  reason: string;
};

export type EventTrace = {
  correlationId?: string | undefined;
  causationId?: string | undefined;
};

export type EventStore = {
  append: (events: readonly NewEvent[], trace?: EventTrace) => Promise<StoredEvent[]>;
  read: (
    afterSeq?: number,
    onUnreadable?: (problem: ReplayProblem) => void,
  ) => AsyncIterable<StoredEvent>;
  subscribe: (filter?: EventFilter, signal?: Cancellation) => AsyncIterable<StoredEvent>;
  lastSeq: () => Promise<number>;
  firstId: () => Promise<string | null>;
};

export type SecretStore = {
  get: (key: SecretKeyName) => Promise<string | null>;
  set: (key: SecretKeyName, value: string) => Promise<void>;
  delete: (key: SecretKeyName) => Promise<void>;
};

export type IntakeItem = {
  externalId: string;
  title: string;
  body: string;
  url: string;
  author: string;
  labels: string[];
};

export type IntakeConnector = {
  readonly id: MailConnector;
  poll: (project: Project, signal?: Cancellation) => Promise<IntakeItem[]>;
  acknowledge: (
    project: Project,
    mail: MailItem,
    ack: MailAck,
    signal?: Cancellation,
  ) => Promise<void>;
};
