import { OFFICE_DIR, OFFICE_FILE, OfficeFile } from "../packages/protocol/src/office-file.ts";
import { resolve } from "node:path";

const path = resolve(import.meta.dir, "../schema/office.schema.json");

const schema = OfficeFile.toJSONSchema({ target: "draft-2020-12", io: "input" });
const wanted = `${JSON.stringify(
  { title: `Home Office floor (${OFFICE_DIR}/${OFFICE_FILE})`, ...schema },
  null,
  2,
)}\n`;

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
