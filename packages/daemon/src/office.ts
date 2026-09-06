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
import type { Actor } from "@ho/protocol";
import { DomainFailure } from "./errors.ts";
import type { Logger } from "./logger.ts";

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

  private constructor(store: EventStore, clock: Clock, log: Logger) {
    this.store = store;
    this.clock = clock;
    this.#log = log;
    this.ids = createIdFactory(clock, {
      randomize: (bytes) => {
        crypto.getRandomValues(bytes);
      },
    });
  }

  static async open(store: EventStore, clock: Clock, log: Logger): Promise<Office> {
    const office = new Office(store, clock, log);
    let count = 0;
    for await (const event of store.read()) {
      applyEvent(office.model, event);
      count += 1;
    }
    log.info({ events: count, lastSeq: office.model.lastSeq }, "read model rebuilt");
    return office;
  }

  async execute<T>(
    actor: Actor,
    command: (model: ReadModel, ctx: CommandContext) => CommandResult<T>,
  ): Promise<T> {
    const ctx: CommandContext = { ids: this.ids, now: this.clock.now().toISOString(), actor };
    const result = command(this.model, ctx);
    if (!result.ok) {
      throw new DomainFailure(result.error);
    }
    const stored = await this.store.append(result.value.events);
    for (const event of stored) {
      applyEvent(this.model, event);
    }
    this.#log.debug({ types: stored.map((e) => e.type) }, "events appended");
    return result.value.value;
  }
}
