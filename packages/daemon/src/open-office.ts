import type { Clock, IdFactory } from "@ho/core";
import { createSqliteEventStore, openDatabase } from "@ho/store";
import { join } from "node:path";
import type { Logger } from "./logger.ts";
import { Office } from "./office.ts";

const DB_FILE = "ho.db";

export type Opened = {
  database: ReturnType<typeof openDatabase>;
  store: ReturnType<typeof createSqliteEventStore>;
  office: Office;
};

export async function openOffice(
  home: string,
  migrationsDir: string | null,
  ids: IdFactory,
  clock: Clock,
  log: Logger,
): Promise<Opened> {
  const path = join(home, DB_FILE);
  const database = openDatabase(path, { migrationsDir });
  const store = createSqliteEventStore(database.db, { ids, clock });
  try {
    return { database, store, office: await Office.open(store, clock, log) };
  } catch (error) {
    database.close();
    throw new Error(
      "Cannot replay the event log; database preserved. Restore or migrate it before starting.",
      { cause: error },
    );
  }
}
