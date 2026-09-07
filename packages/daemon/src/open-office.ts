import type { Clock, IdFactory } from "@ho/core";
import { createSqliteEventStore, openDatabase } from "@ho/store";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Logger } from "./logger.ts";
import { Office } from "./office.ts";

const DB_FILE = "ho.db";

export type Opened = {
  database: ReturnType<typeof openDatabase>;
  store: ReturnType<typeof createSqliteEventStore>;
  office: Office;
};

/**
 * Opens the event log and rebuilds the read model. A log written before D23 (projects without a repository,
 * agents with several projects) no longer parses; it is archived as `ho.db.bak-<timestamp>` and the office
 * starts over with an empty log (owner's decision, 2026-09-07).
 */
export async function openOffice(
  home: string,
  migrationsDir: string | null,
  ids: IdFactory,
  clock: Clock,
  log: Logger,
): Promise<Opened> {
  const path = join(home, DB_FILE);
  const open = async (): Promise<Opened> => {
    const database = openDatabase(path, { migrationsDir });
    const store = createSqliteEventStore(database.db, { ids, clock });
    try {
      return { database, store, office: await Office.open(store, clock, log) };
    } catch (error) {
      database.close();
      throw error;
    }
  };
  try {
    return await open();
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      throw error;
    }
    const stamp = clock.now().toISOString().replaceAll(/[:.]/gu, "-");
    for (const suffix of ["", "-wal", "-shm"]) {
      await rename(`${path}${suffix}`, `${path}.bak-${stamp}${suffix}`).catch(() => null);
    }
    log.warn(
      { archived: `${path}.bak-${stamp}` },
      "event log predates D23; archived, starting fresh",
    );
    return open();
  }
}
