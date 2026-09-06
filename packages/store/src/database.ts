import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.ts";

export type HoDatabase = ReturnType<typeof openDatabase>["db"];

/** Opens (or creates) the SQLite file in WAL mode and applies pending migrations. */
export function openDatabase(
  path: string,
  options: { migrationsDir?: string | null } = {},
): {
  db: ReturnType<typeof drizzle<typeof schema>>;
  close: () => void;
} {
  const client = new Database(path, { create: true, strict: true });
  client.run("PRAGMA journal_mode = WAL");
  client.run("PRAGMA synchronous = NORMAL");
  client.run("PRAGMA foreign_keys = ON");
  client.run("PRAGMA busy_timeout = 5000");
  const db = drizzle({ client, schema });
  // Bundled builds (the desktop app) pass the copied folder; in development it sits next to this package.
  const migrationsFolder =
    options.migrationsDir ?? fileURLToPath(new URL("../drizzle", import.meta.url));
  migrate(db, { migrationsFolder });
  return {
    db,
    close: () => {
      client.run("PRAGMA wal_checkpoint(TRUNCATE)");
      client.close();
    },
  };
}
