import type { Cancellation, Clock, EventFilter, EventStore, IdFactory } from "@ho/core";
import { type NewEvent, StoredEvent } from "@ho/protocol";
import { and, asc, gt, inArray, max } from "drizzle-orm";
import type { HoDatabase } from "./database.ts";
import { events } from "./schema.ts";

const BATCH = 500;

type Subscriber = { filter: EventFilter | undefined; push: (event: StoredEvent) => void };

type Row = typeof events.$inferSelect;

const toStored = (row: Row): StoredEvent =>
  StoredEvent.parse({
    seq: row.seq,
    id: row.id,
    type: row.type,
    at: row.at,
    actor: row.actor,
    payload: row.payload,
    ...(row.correlationId === null ? {} : { correlationId: row.correlationId }),
    ...(row.causationId === null ? {} : { causationId: row.causationId }),
  });

const matches = (filter: EventFilter | undefined, event: StoredEvent): boolean =>
  filter?.types === undefined || filter.types.includes(event.type);

/** Async queue with back-pressure-free buffering; one per live subscriber. */
function channel<T>(signal?: Cancellation): {
  push: (item: T) => void;
  iterate: () => AsyncIterable<T>;
  close: () => void;
} {
  const buffer: T[] = [];
  let pending: PromiseWithResolvers<void> | null = null;
  let closed = false;
  const notify = (): void => {
    pending?.resolve();
    pending = null;
  };
  const close = (): void => {
    closed = true;
    notify();
  };
  signal?.addEventListener("abort", close);
  return {
    push: (item) => {
      if (!closed) {
        buffer.push(item);
        notify();
      }
    },
    close,
    iterate: async function* () {
      for (;;) {
        const next = buffer.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        if (closed) {
          return;
        }
        pending = Promise.withResolvers<void>();
        await pending.promise;
      }
    },
  };
}

export function createSqliteEventStore(
  db: HoDatabase,
  deps: { ids: IdFactory; clock: Clock },
): EventStore {
  const subscribers = new Set<Subscriber>();

  const append = (batch: readonly NewEvent[]): Promise<StoredEvent[]> => {
    if (batch.length === 0) {
      return Promise.resolve([]);
    }
    const at = deps.clock.now().toISOString();
    const stored = db.transaction((tx) => {
      const out: StoredEvent[] = [];
      for (const event of batch) {
        const id = deps.ids.event();
        const inserted = tx
          .insert(events)
          .values({
            id,
            type: event.type,
            at,
            actor: event.actor,
            correlationId: event.correlationId ?? null,
            causationId: event.causationId ?? null,
            payload: event.payload,
          })
          .returning({ seq: events.seq })
          .get();
        out.push(StoredEvent.parse({ ...event, id, at, seq: inserted.seq }));
      }
      return out;
    });
    for (const event of stored) {
      for (const subscriber of subscribers) {
        if (matches(subscriber.filter, event)) {
          subscriber.push(event);
        }
      }
    }
    return Promise.resolve(stored);
  };

  // oxlint-disable-next-line typescript/require-await -- bun:sqlite is synchronous; the port is async for remote backends
  async function* read(afterSeq = -1, filter?: EventFilter): AsyncIterable<StoredEvent> {
    let cursor = afterSeq;
    for (;;) {
      const where =
        filter?.types === undefined
          ? gt(events.seq, cursor)
          : and(gt(events.seq, cursor), inArray(events.type, [...filter.types]));
      const rows = db
        .select()
        .from(events)
        .where(where)
        .orderBy(asc(events.seq))
        .limit(BATCH)
        .all();
      for (const row of rows) {
        const event = toStored(row);
        if (matches(filter, event)) {
          yield event;
        }
        cursor = row.seq;
      }
      if (rows.length < BATCH) {
        return;
      }
    }
  }

  const subscribe = (filter?: EventFilter, signal?: Cancellation): AsyncIterable<StoredEvent> => {
    const chan = channel<StoredEvent>(signal);
    const subscriber: Subscriber = { filter, push: chan.push };
    subscribers.add(subscriber);
    signal?.addEventListener("abort", () => {
      subscribers.delete(subscriber);
    });
    return chan.iterate();
  };

  const lastSeq = (): Promise<number> => {
    const row = db
      .select({ value: max(events.seq) })
      .from(events)
      .get();
    return Promise.resolve(row?.value ?? -1);
  };

  return { append, read, subscribe, lastSeq };
}
