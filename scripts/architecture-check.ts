import { Glob } from "bun";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * The architecture, as something the build refuses to break rather than something a document asks for.
 *
 * `docs/ARCHITECTURE.md` states the rules. Two of them already had teeth — `types: []` keeps host
 * globals out of the pure packages, and oxlint's `import/no-cycle` keeps modules acyclic. The rest held
 * only by discipline: nothing stopped `@ho/core` from growing a dependency on the daemon, or a second
 * writer of the projection, or an adapter reached from outside a composition root. An audit found them
 * all intact on 2026-09-16; this is what keeps them that way.
 */

const root = resolve(import.meta.dir, "..");
const problems: string[] = [];
const fail = (rule: string, detail: string): void => {
  problems.push(`${rule}: ${detail}`);
};

const read = (path: string): Promise<string> => readFile(resolve(root, path), "utf8");

const sourcesOf = async (dir: string): Promise<{ path: string; text: string }[]> => {
  const found: { path: string; text: string }[] = [];
  for (const file of new Glob("**/*.{ts,tsx}").scanSync(resolve(root, dir))) {
    found.push({ path: `${dir}/${file}`, text: await read(`${dir}/${file}`) });
  }
  return found;
};

/**
 * Lower numbers may not depend on higher ones. `protocol` is the shared vocabulary and depends on
 * nothing; `core` and `sim` are the pure domain; adapters implement core's ports; the daemon composes
 * them. `ui` sits with the adapters because it consumes core and sim without being consumed by them.
 */
const LAYER: Readonly<Record<string, number>> = {
  "@ho/protocol": 0,
  "@ho/core": 1,
  "@ho/sim": 1,
  "@ho/store": 2,
  "@ho/secrets": 2,
  "@ho/sandbox-docker": 2,
  "@ho/runtime-acp": 2,
  "@ho/runtime-claude-code": 2,
  "@ho/intake-github": 2,
  "@ho/runner": 2,
  "@ho/ui": 2,
  "@ho/daemon": 3,
};

/** The two fields this needs, read out of a manifest without assuming the rest of its shape. */
const manifestOf = (value: unknown): { name: string | null; deps: string[] } => {
  if (typeof value !== "object" || value === null) {
    return { name: null, deps: [] };
  }
  const fields = new Map<string, unknown>(Object.entries(value));
  const name: unknown = fields.get("name");
  const deps: unknown = fields.get("dependencies");
  return {
    name: typeof name === "string" ? name : null,
    deps: typeof deps === "object" && deps !== null ? Object.keys(deps) : [],
  };
};

for (const file of new Glob("{packages,apps}/*/package.json").scanSync(root)) {
  const parsed: unknown = JSON.parse(await read(file));
  const manifest = manifestOf(parsed);
  const name = manifest.name ?? file;
  const own = LAYER[name];
  for (const dependency of manifest.deps) {
    if (!dependency.startsWith("@ho/")) {
      continue;
    }
    const theirs = LAYER[dependency];
    if (theirs === undefined) {
      fail("layering", `${name} depends on ${dependency}, which has no declared layer`);
    } else if (own !== undefined && theirs >= own) {
      // An app is above everything and is not itself a layer; packages go strictly downwards.
      fail("layering", `${name} (layer ${String(own)}) may not depend on ${dependency}`);
    }
  }
}

const HOST =
  /\bfrom "node:|\bBun\.|\bprocess\.|\bfetch\(|\bdocument\.|\bwindow\.|\bDate\.now\(|\bMath\.random\(/u;

for (const pure of ["packages/core/src", "packages/sim/src"]) {
  for (const { path, text } of await sourcesOf(pure)) {
    if (HOST.test(text)) {
      fail("purity", `${path} reaches for a host global; core and sim take them as ports`);
    }
  }
}

const REDUCER = "packages/core/src/model/reduce.ts";
const SETTER = /\b(?:tasks|agents|projects|sessions|mail)\.set\(/u;

for (const area of ["packages/core/src", "packages/daemon/src", "packages/ui/src"]) {
  for (const { path, text } of await sourcesOf(area)) {
    if (path !== REDUCER && SETTER.test(text.replaceAll(/^\s*\/[/*].*$/gmu, ""))) {
      fail("projection", `${path} writes an entity map; only ${REDUCER} may`);
    }
  }
}

const APPENDER = "packages/daemon/src/office.ts";
for (const { path, text } of await sourcesOf("packages/daemon/src")) {
  if (path !== APPENDER && /\bstore\.append\(/u.test(text)) {
    fail("event log", `${path} appends events; only ${APPENDER} may, so commands stay serialised`);
  }
}

const ADAPTERS =
  /from "@ho\/(?:sandbox-docker|store|secrets|runtime-acp|runtime-claude-code|intake-github)"/u;
/** Where wiring a concrete adapter is the job rather than a leak. */
const COMPOSITION = new Set([
  "packages/daemon/src/launch.ts",
  "packages/daemon/src/runtimes.ts",
  "packages/daemon/src/office.ts",
  "packages/daemon/src/daemon-info.ts",
]);

for (const { path, text } of await sourcesOf("packages/daemon/src")) {
  for (const line of text.split("\n")) {
    if (ADAPTERS.test(line) && !line.includes("import type") && !COMPOSITION.has(path)) {
      fail(
        "ports",
        `${path} imports a concrete adapter; take it from the composition root instead`,
      );
    }
  }
}

/** Commands live in `core/src/commands`; the office asks the daemon to run them over RPC. */
const COMMANDS = new Set<string>();
for (const file of new Glob("*.ts").scanSync(resolve(root, "packages/core/src/commands"))) {
  const text = await read(`packages/core/src/commands/${file}`);
  for (const found of text.matchAll(/^export function (?<name>[a-z]\w+)/gmu)) {
    const name = found.groups?.["name"];
    if (name !== undefined) {
      COMMANDS.add(name);
    }
  }
}
for (const { path, text } of await sourcesOf("packages/ui/src")) {
  for (const found of text.matchAll(/import \{(?<names>[^}]*)\} from "@ho\/core"/gu)) {
    for (const raw of (found.groups?.["names"] ?? "").split(",")) {
      const name = raw.replace("type ", "").trim();
      if (COMMANDS.has(name)) {
        fail(
          "ui",
          `${path} imports the command ${name}; the office asks the daemon to run commands`,
        );
      }
    }
  }
}

for (const problem of problems) {
  process.stdout.write(`✖ ${problem}\n`);
}
process.stdout.write(
  problems.length === 0
    ? `✔ architecture: layering, purity, one projection writer, one appender, ports, and ${String(COMMANDS.size)} commands that stay server-side\n`
    : `${String(problems.length)} architecture violation(s)\n`,
);
process.exit(problems.length === 0 ? 0 : 1);
