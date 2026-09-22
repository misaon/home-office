import { exec } from "./host-exec.ts";

const GIT_TIMEOUT_MS = 20_000;
const DEPTH_MAX = 2;
const DIRS_MAX = 6;
const CHECK_SCRIPTS = ["check", "lint", "typecheck", "test", "build"] as const;

type Manager = { lock: string; setup: string; run: (script: string) => string };

const MANAGERS: readonly Manager[] = [
  { lock: "bun.lock", setup: "bun install --frozen-lockfile", run: (s) => `bun run ${s}` },
  { lock: "bun.lockb", setup: "bun install --frozen-lockfile", run: (s) => `bun run ${s}` },
  { lock: "pnpm-lock.yaml", setup: "pnpm install --frozen-lockfile", run: (s) => `pnpm run ${s}` },
  { lock: "yarn.lock", setup: "yarn install --immutable", run: (s) => `yarn ${s}` },
  { lock: "package-lock.json", setup: "npm ci", run: (s) => `npm run ${s}` },
];

const OTHER_LOCKS: Readonly<Record<string, string>> = {
  "composer.lock": "composer install --no-interaction --prefer-dist",
  "poetry.lock": "poetry install",
  "requirements.txt": "pip install -r requirements.txt",
  "Cargo.lock": "cargo fetch",
  "go.sum": "go mod download",
};

type BuildTool = {
  markers: readonly string[];
  wrapper: string;
  tool: string;
  setup: string;
  checks: Readonly<Record<string, string>>;
};

const BUILD_TOOLS: readonly BuildTool[] = [
  {
    markers: ["pom.xml"],
    wrapper: "mvnw",
    tool: "mvn",
    setup: "-B -ntp -q test-compile",
    checks: { test: "-B -ntp test", verify: "-B -ntp verify" },
  },
  {
    markers: ["settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts"],
    wrapper: "gradlew",
    tool: "gradle",
    setup: "-q testClasses",
    checks: { test: "test", check: "check" },
  },
];

export type EnvironmentSuggestion = {
  dir: string;
  setup: string[];
  checks: Record<string, string>;
};

const dirOf = (path: string): string => {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
};

const depthOf = (dir: string): number => (dir === "" ? 0 : dir.split("/").length);

const ancestorsOf = (dir: string): string[] => {
  if (dir === "") {
    return [];
  }
  const parts = dir.split("/");
  return parts.map((_, index) => parts.slice(0, index).join("/"));
};

const inDir = (dir: string, command: string): string =>
  dir === "" ? command : `cd ${dir} && ${command}`;

const buildToolOf = (names: ReadonlySet<string>): BuildTool | undefined =>
  BUILD_TOOLS.find((tool) => tool.markers.some((marker) => names.has(marker)));

const rootBuildToolOf = (
  byDir: ReadonlyMap<string, ReadonlySet<string>>,
  dir: string,
): BuildTool | undefined => {
  const names = byDir.get(dir);
  const tool = names === undefined ? undefined : buildToolOf(names);
  const nested = ancestorsOf(dir).some((ancestor) => {
    const above = byDir.get(ancestor);
    return above !== undefined && buildToolOf(above) === tool;
  });
  return nested ? undefined : tool;
};

const buildCommand = (
  dir: string,
  names: ReadonlySet<string>,
  tool: BuildTool,
  args: string,
): string => inDir(dir, `${names.has(tool.wrapper) ? `./${tool.wrapper}` : tool.tool} ${args}`);

const scriptsOf = async (
  path: string,
  branch: string,
  file: string,
): Promise<Record<string, unknown>> => {
  const shown = await exec(["git", "-C", path, "show", `${branch}:${file}`], {
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (shown.code !== 0) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(shown.stdout);
    if (typeof parsed !== "object" || parsed === null || !("scripts" in parsed)) {
      return {};
    }
    const { scripts } = parsed;
    return typeof scripts === "object" && scripts !== null
      ? Object.fromEntries(Object.entries(scripts))
      : {};
  } catch {
    return {};
  }
};

export async function suggestEnvironment(
  sourcePath: string,
  branch: string,
): Promise<EnvironmentSuggestion[]> {
  const listed = await exec(["git", "-C", sourcePath, "ls-tree", "-r", "--name-only", branch], {
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (listed.code !== 0) {
    return [];
  }
  const files = listed.stdout.split("\n").filter((line) => line !== "");
  const byDir = new Map<string, Set<string>>();
  for (const file of files) {
    const dir = dirOf(file);
    if (depthOf(dir) > DEPTH_MAX) {
      continue;
    }
    const name = file.slice(dir === "" ? 0 : dir.length + 1);
    const names = byDir.get(dir) ?? new Set<string>();
    names.add(name);
    byDir.set(dir, names);
  }
  const suggestions: EnvironmentSuggestion[] = [];
  for (const [dir, names] of [...byDir.entries()].toSorted(([a], [b]) => a.localeCompare(b))) {
    const manager = MANAGERS.find((candidate) => names.has(candidate.lock));
    const build = rootBuildToolOf(byDir, dir);
    const setup = [
      ...(manager === undefined ? [] : [inDir(dir, manager.setup)]),
      ...Object.entries(OTHER_LOCKS)
        .filter(([lock]) => names.has(lock))
        .map(([, command]) => inDir(dir, command)),
      ...(build === undefined ? [] : [buildCommand(dir, names, build, build.setup)]),
    ];
    if (setup.length === 0) {
      continue;
    }
    const checks: Record<string, string> = {};
    if (build !== undefined) {
      for (const [name, args] of Object.entries(build.checks)) {
        checks[name] = buildCommand(dir, names, build, args);
      }
    }
    if (manager !== undefined && names.has("package.json")) {
      const scripts = await scriptsOf(
        sourcePath,
        branch,
        dir === "" ? "package.json" : `${dir}/package.json`,
      );
      for (const script of CHECK_SCRIPTS) {
        if (typeof scripts[script] === "string") {
          checks[script] = inDir(dir, manager.run(script));
        }
      }
    }
    suggestions.push({ dir, setup, checks });
    if (suggestions.length >= DIRS_MAX) {
      break;
    }
  }
  return suggestions;
}

export const suggestedConfig = (suggestions: readonly EnvironmentSuggestion[]): string => {
  const setup = suggestions.flatMap((suggestion) => suggestion.setup);
  const checks = Object.fromEntries(
    suggestions.flatMap((suggestion) =>
      Object.entries(suggestion.checks).map(([name, command]) => [
        suggestion.dir === "" ? name : `${suggestion.dir.replaceAll("/", "-")}-${name}`,
        command,
      ]),
    ),
  );
  const verify = Object.values(checks).at(-1);
  return JSON.stringify(
    {
      environment: { setup, checks },
      ...(verify === undefined ? {} : { verify: { command: verify } }),
    },
    null,
    2,
  );
};
