import { parseSkill } from "../packages/daemon/src/skills.ts";
import { Glob } from "bun";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

/**
 * Validates every shipped `SKILL.md` against the published Agent Skills format
 * (agentskills.io/specification, read 2026-09-15), so a pack that no runtime would load fails here
 * rather than in a session. The body limit is the specification's own recommendation.
 */
const BODY_LINES_MAX = 500;
const root = resolve(import.meta.dir, "../images/agent/plugins");

const problems: string[] = [];
let checked = 0;
for (const relative of new Glob("*/skills/*/SKILL.md").scanSync(root)) {
  const path = resolve(root, relative);
  const parsed = parseSkill(await readFile(path, "utf8"), basename(dirname(path)));
  checked += 1;
  if (!parsed.ok) {
    problems.push(`${relative}: ${parsed.reason}`);
    continue;
  }
  const lines = parsed.value.body.split("\n").length;
  if (lines > BODY_LINES_MAX) {
    problems.push(
      `${relative}: body is ${String(lines)} lines; keep it under ${String(BODY_LINES_MAX)}`,
    );
  }
}
for (const problem of problems) {
  process.stdout.write(`✖ ${problem}\n`);
}
process.stdout.write(
  problems.length === 0 ? `✔ ${String(checked)} skills\n` : `${String(problems.length)} invalid\n`,
);
process.exit(problems.length === 0 ? 0 : 1);
