import { Database } from "bun:sqlite";
import {
  type Cancellation,
  type Clock,
  createChannel,
  type EventFilter,
  type EventStore,
  type IdFactory,
} from "@ho/core";
import { errorCode, type NewEvent, StoredEvent } from "@ho/protocol";
import { chmod } from "node:fs/promises";
import { z } from "zod";

const BATCH = 500;
const SCHEMA_VERSION = 1;

/**
 * The event log's one table, in the shape the old ORM created before 2026-09-13, so an existing file
 * opens as it is. The two nullable id columns carry no data — they are always written NULL — and exist
 * only so this one statement matches both an old file and a new one.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
    seq integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    id text NOT NULL,
    type text NOT NULL,
    at text NOT NULL,
    actor text NOT NULL,
    correlation_id text,
    causation_id text,
    payload text NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS events_id_unique ON events (id)",
  "DROP TABLE IF EXISTS __drizzle_migrations",
];

const Row = z.object({
  seq: z.int(),
  id: z.string(),
  type: z.string(),
  at: z.string(),
  actor: z.string(),
  payload: z.string(),
});

/** Names the row a schema change has orphaned; without it a replay failure says only which field broke. */
const toStored = (raw: unknown): StoredEvent => {
  const row = Row.parse(raw);
  const named = (what: string, cause: unknown): Error =>
    new Error(`stored event ${String(row.seq)} (${row.type}, ${row.at}) ${what}`, { cause });
  let actor: unknown;
  let payload: unknown;
  try {
    actor = JSON.parse(row.actor);
    payload = JSON.parse(row.payload);
  } catch (error) {
    throw named("is not readable JSON", error);
  }
  const parsed = StoredEvent.safeParse({
    seq: row.seq,
    id: row.id,
    type: row.type,
    at: row.at,
    actor,
    payload,
  });
  if (!parsed.success) {
    throw named("does not match the current schema", parsed.error);
  }
  return parsed.data;
};

const matches = (filter: EventFilter | undefined, event: StoredEvent): boolean =>
  filter?.types === undefined || filter.types.includes(event.type);

/** The log carries briefs and reports, so it is the owner's alone; the WAL and shm files inherit its mode. */
const restrict = async (path: string): Promise<void> => {
  for (const file of [path, `${path}-wal`, `${path}-shm`]) {
    await chmod(file, 0o600).catch((error: unknown) => {
      if (errorCode(error) !== "ENOENT") {
        throw error;
      }
    });
  }
};

/** Opens (or creates) the SQLite event log in WAL mode, mode 0600, with its schema in place. */
export async function openEventStore(
  path: string,
  deps: { ids: IdFactory; clock: Clock },
): Promise<EventStore & { close: () => void }> {
  const db = new Database(path, { create: true, strict: true });
  // A half-opened database would hold the file locked with nobody left holding a handle to close it.
  try {
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA synchronous = NORMAL");
    db.run("PRAGMA busy_timeout = 5000");
    const version = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
    if (version?.user_version !== SCHEMA_VERSION) {
      for (const statement of SCHEMA) {
        db.run(statement);
      }
      db.run(`PRAGMA user_version = ${String(SCHEMA_VERSION)}`);
    }
    await restrict(path);
  } catch (error) {
    db.close();
    throw error;
  }

  const insert = db.query<{ seq: number }, [string, string, string, string, string]>(
    "INSERT INTO events (id, type, at, actor, payload) VALUES (?, ?, ?, ?, ?) RETURNING seq",
  );
  const after = db.query<unknown, [number, number]>(
    "SELECT seq, id, type, at, actor, payload FROM events WHERE seq > ? ORDER BY seq LIMIT ?",
  );
  const newest = db.query<{ seq: number | null }, []>("SELECT max(seq) AS seq FROM events");
  const oldest = db.query<{ id: string }, []>("SELECT id FROM events ORDER BY seq LIMIT 1");
  const subscribers = new Set<{
    filter: EventFilter | undefined;
    push: (event: StoredEvent) => void;
  }>();

  const appendAll = db.transaction((batch: readonly NewEvent[], at: string): StoredEvent[] =>
    batch.map((event) => {
      const id = deps.ids.event();
      const inserted = insert.get(
        id,
        event.type,
        at,
        JSON.stringify(event.actor),
        JSON.stringify(event.payload),
      );
      if (inserted === null) {
        throw new Error("the event log did not return a sequence number");
      }
      return StoredEvent.parse({ ...event, id, at, seq: inserted.seq });
    }),
  );

  return {
    append: (batch) => {
      if (batch.length === 0) {
        return Promise.resolve([]);
      }
      const stored = appendAll(batch, deps.clock.now().toISOString());
      for (const event of stored) {
        for (const subscriber of subscribers) {
          if (matches(subscriber.filter, event)) {
            subscriber.push(event);
          }
        }
      }
      return Promise.resolve(stored);
    },
    // oxlint-disable-next-line typescript/require-await -- bun:sqlite is synchronous; the port is async for remote backends
    async *read(afterSeq = -1) {
      let cursor = afterSeq;
      for (;;) {
        const rows = after.all(cursor, BATCH);
        for (const raw of rows) {
          const event = toStored(raw);
          yield event;
          cursor = event.seq;
        }
        if (rows.length < BATCH) {
          return;
        }
      }
    },
    subscribe: (filter?: EventFilter, signal?: Cancellation) => {
      const subscriber = {
        filter,
        push: (event: StoredEvent): void => {
          channel.push(event);
        },
      };
      const channel = createChannel<StoredEvent>(signal, {
        onClose: () => {
          subscribers.delete(subscriber);
        },
      });
      if (!channel.closed) {
        subscribers.add(subscriber);
      }
      return channel.iterate();
    },
    lastSeq: () => Promise.resolve(newest.get()?.seq ?? -1),
    firstId: () => Promise.resolve(oldest.get()?.id ?? null),
    close: () => {
      db.run("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();
    },
  };
}
