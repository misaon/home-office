import journal from "../drizzle/meta/_journal.json" with { type: "json" };
import first from "../drizzle/0000_boring_clint_barton.sql" with { type: "text" };
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EMBEDDED: Readonly<Record<string, string>> = { "0000_boring_clint_barton": first };

/**
 * A folder the Drizzle migrator can read. A compiled binary (`bun build --compile`) has no real
 * `packages/store/drizzle` on disk, so the migrations travel inside the executable as import attributes and
 * are materialised once into a content-addressed temporary folder, byte for byte as Drizzle wrote them —
 * which keeps its hashes and `__drizzle_migrations` bookkeeping identical. Source runs and the packaged
 * desktop app pass their own folder and never reach this.
 */
export async function materializeMigrations(): Promise<string> {
  const missing = journal.entries.filter((entry) => EMBEDDED[entry.tag] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `migrations not embedded: ${missing.map((entry) => entry.tag).join(", ")} — add them to EMBEDDED in packages/store/src/migrations.ts with a matching <tag>.sql.d.ts`,
    );
  }
  const stamp = new Bun.CryptoHasher("sha256")
    .update(JSON.stringify(journal))
    .update(Object.values(EMBEDDED).join("\0"))
    .digest("hex")
    .slice(0, 16);
  const dir = join(tmpdir(), `ho-migrations-${stamp}`);
  if (existsSync(join(dir, "meta", "_journal.json"))) {
    return dir;
  }
  await mkdir(join(dir, "meta"), { recursive: true });
  await Promise.all([
    writeFile(join(dir, "meta", "_journal.json"), JSON.stringify(journal)),
    ...Object.entries(EMBEDDED).map(([tag, sql]) => writeFile(join(dir, `${tag}.sql`), sql)),
  ]);
  return dir;
}
