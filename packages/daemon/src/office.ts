import {
  applyEvent,
  type Clock,
  type CommandContext,
  type CommandResult,
  createIdFactory,
  createReadModel,
  type EventStore,
  type IdFactory,
  type ReadModel,
} from "@ho/core";
import type { Actor, StoredEvent } from "@ho/protocol";
import { openEventStore } from "@ho/store";
import { join } from "node:path";
import { DomainFailureError } from "./domain-failure.ts";
import { AttachmentStore } from "./attachments.ts";
import type { Logger } from "./logger.ts";

const DB_FILE = "ho.db";

/**
 * The office holds the read model and turns commands into appended events.
 * Every mutation goes through `execute`, so the model only ever changes by applying stored events.
 */
export class Office {
  readonly model: ReadModel = createReadModel();
  readonly ids: IdFactory;
  readonly store: EventStore;
  readonly clock: Clock;
  readonly #log: Logger;
  #commands: Promise<unknown> = Promise.resolve();

  constructor(store: EventStore, ids: IdFactory, clock: Clock, log: Logger) {
    this.store = store;
    this.ids = ids;
    this.clock = clock;
    this.#log = log;
  }

  execute<T>(
    actor: Actor,
    command: (model: ReadModel, ctx: CommandContext) => CommandResult<T>,
  ): Promise<T> {
    const result = this.#commands.then(() => this.#execute(actor, command));
    this.#commands = result.catch(() => undefined);
    return result;
  }

  async #execute<T>(
    actor: Actor,
    command: (model: ReadModel, ctx: CommandContext) => CommandResult<T>,
  ): Promise<T> {
    const ctx: CommandContext = { ids: this.ids, now: this.clock.now().toISOString(), actor };
    const result = command(this.model, ctx);
    if (!result.ok) {
      throw new DomainFailureError(result.error);
    }
    const stored = await this.store.append(result.value.events);
    for (const event of stored) {
      applyEvent(this.model, event);
    }
    this.#log.debug({ types: stored.map((e) => e.type) }, "events appended");
    return result.value.read(this.model);
  }
}

/** Opens the event log under `home` and replays it into a fresh office. The file is never replaced. */
export async function openOffice(
  home: string,
  clock: Clock,
  log: Logger,
): Promise<{ office: Office; attachments: AttachmentStore; close: () => void }> {
  // Both halves of the office's state live under the same directory: the log, and the files it names.
  const attachments = new AttachmentStore(home);
  await attachments.init();
  const ids = createIdFactory(clock, {
    randomize: (bytes) => {
      crypto.getRandomValues(bytes);
    },
  });
  const path = join(home, DB_FILE);
  const store = await openEventStore(path, { ids, clock });
  const office = new Office(store, ids, clock, log);
  try {
    let count = 0;
    for await (const event of store.read()) {
      applyEvent(office.model, event);
      count += 1;
    }
    log.info({ events: count, lastSeq: office.model.lastSeq }, "read model rebuilt");
  } catch (error) {
    store.close();
    throw new Error(
      `Cannot replay the event log; ${path} is preserved and untouched. Restore it from a backup, or — if the events predate a schema change and are expendable — move ${DB_FILE}, ${DB_FILE}-wal and ${DB_FILE}-shm aside and start with an empty log.`,
      { cause: error },
    );
  }
  return { office, attachments, close: store.close };
}

/**
 * Follows the stored events of the given types until stopped, running `handler` for each and awaiting
 * every handler it started before `stop()` resolves. Handler failures are logged, never fatal.
 */
export function followEvents(
  office: Office,
  types: readonly StoredEvent["type"][],
  handler: (event: StoredEvent) => Promise<void> | void,
  log: Logger,
  what: string,
): { stop: () => Promise<void> } {
  const controller = new AbortController();
  const pending = new Set<Promise<void>>();
  const listening = (async () => {
    for await (const event of office.store.subscribe({ types }, controller.signal)) {
      const work = Promise.resolve()
        .then(() => handler(event))
        .catch((error: unknown) => {
          log.warn({ err: String(error), type: event.type }, `${what} failed`);
        })
        .finally(() => {
          pending.delete(work);
        });
      pending.add(work);
    }
  })().catch((error: unknown) => {
    log.error({ err: String(error) }, `${what} subscription failed`);
  });
  return {
    stop: async () => {
      controller.abort();
      await listening;
      await Promise.allSettled(pending);
    },
  };
}
