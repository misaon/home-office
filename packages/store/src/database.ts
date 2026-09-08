import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { materializeMigrations } from "./migrations.ts";
import * as schema from "./schema.ts";

export type HoDatabase = Awaited<ReturnType<typeof openDatabase>>["db"];

async function migrationsFolderFor(migrationsDir: string | null | undefined): Promise<string> {
  if (migrationsDir !== null && migrationsDir !== undefined) {
    return migrationsDir;
  }
  const beside = fileURLToPath(new URL("../drizzle", import.meta.url));
  return existsSync(beside) ? beside : materializeMigrations();
}

/** Opens (or creates) the SQLite file in WAL mode and applies pending migrations. */
export async function openDatabase(
  path: string,
  options: { migrationsDir?: string | null } = {},
): Promise<{
  db: ReturnType<typeof drizzle<typeof schema>>;
  close: () => void;
}> {
  const migrationsFolder = await migrationsFolderFor(options.migrationsDir);
  const client = new Database(path, { create: true, strict: true });
  client.run("PRAGMA journal_mode = WAL");
  client.run("PRAGMA synchronous = NORMAL");
  client.run("PRAGMA foreign_keys = ON");
  client.run("PRAGMA busy_timeout = 5000");
  const db = drizzle({ client, schema });
  migrate(db, { migrationsFolder });
  return {
    db,
    close: () => {
      client.run("PRAGMA wal_checkpoint(TRUNCATE)");
      client.close();
    },
  };
}
