// A relative import, not the package specifier: the root program declares no workspace dependency, so
// `@ho/protocol` does not resolve from `scripts/` in a clean isolated install. CI caught that; the
// local tree resolved it only because an earlier install had left the package hoisted.
import { OFFICE_DIR, OFFICE_FILE, OfficeFile } from "../packages/protocol/src/office-file.ts";
import { resolve } from "node:path";

/**
 * `schema/office.schema.json`, generated from the Zod schema the daemon actually parses with, so the
 * editor completing a repository's `.ho/config.json` and the office reading it cannot drift apart.
 * The input schema is the one emitted: the file is what a human writes, before defaults are filled in.
 * `--check` fails instead of writing, which is what `bun run check` runs.
 */
const path = resolve(import.meta.dir, "../schema/office.schema.json");

// The schema's own method, not the free `z.toJSONSchema`: the root program resolves a different copy
// of zod than `@ho/protocol` does, and the two instances' types do not meet.
const schema = OfficeFile.toJSONSchema({ target: "draft-2020-12", io: "input" });
const wanted = `${JSON.stringify(
  { title: `Home Office floor (${OFFICE_DIR}/${OFFICE_FILE})`, ...schema },
  null,
  2,
)}\n`;

/** oxfmt owns the committed file's whitespace, so the check compares content, not bytes. */
const content = (text: string | null): string | null => {
  if (text === null) {
    return null;
  }
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return null;
  }
};

if (Bun.argv.includes("--check")) {
  const current = await Bun.file(path)
    .text()
    .catch(() => null);
  if (content(current) !== content(wanted)) {
    process.stdout.write("✖ schema/office.schema.json is out of date; run `bun run schema`\n");
    process.exit(1);
  }
  process.stdout.write("✔ schema/office.schema.json\n");
} else {
  await Bun.write(path, wanted);
  process.stdout.write(`wrote ${path}\n`);
}
