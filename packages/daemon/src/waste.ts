const IDLE_WAIT_MIN_SECONDS = 15;
const SLEEP = /(?:^|[;&|(]\s*)sleep\s+(?<seconds>\d+(?:\.\d+)?)(?<unit>[smh])?\b/gu;
const SEGMENTS = /\s*(?:;|&&|\|\|)\s*/u;
const TRIMMER = /^\s*(?:tail|head)\b/u;
const PIPEFAIL = /pipefail/u;
const WRAPPERS: ReadonlySet<string> = new Set(["timeout", "time", "env", "nice"]);
const RUNNERS: ReadonlySet<string> = new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "bunx",
  "npx",
  "composer",
  "php",
  "phpunit",
  "pytest",
  "python",
  "python3",
  "cargo",
  "go",
  "make",
  "gradle",
  "gradlew",
  "mvn",
  "dotnet",
  "swift",
  "xcodebuild",
  "tsc",
  "eslint",
  "vitest",
  "jest",
]);
const SKIPPED_TOKEN = /^(?:\d+[smh]?|[A-Za-z_][A-Za-z0-9_]*=.*)$/u;

const commandOf = (tool: string, input: unknown): string | null => {
  if (tool !== "Bash" || typeof input !== "object" || input === null || !("command" in input)) {
    return null;
  }
  return typeof input.command === "string" ? input.command : null;
};

export const idleWaitSeconds = (tool: string, input: unknown): number => {
  const command = commandOf(tool, input);
  if (command === null) {
    return 0;
  }
  let total = 0;
  for (const found of command.matchAll(SLEEP)) {
    const seconds = Number(found.groups?.["seconds"] ?? "0");
    const unit = found.groups?.["unit"];
    total += unit === "m" ? seconds * 60 : unit === "h" ? seconds * 3600 : seconds;
  }
  return total >= IDLE_WAIT_MIN_SECONDS ? Math.round(total) : 0;
};

const runsACheck = (segment: string): boolean => {
  const tokens = segment.trim().split(/\s+/u);
  let at = 0;
  while (at < tokens.length) {
    const token = tokens[at] ?? "";
    if (!WRAPPERS.has(token) && !SKIPPED_TOKEN.test(token)) {
      break;
    }
    at += 1;
  }
  const command = tokens[at] ?? "";
  return RUNNERS.has(command.split("/").at(-1) ?? "") || /(?:^|\/)vendor\/bin\//u.test(command);
};

export const masksExitCode = (tool: string, input: unknown): boolean => {
  const command = commandOf(tool, input);
  if (command === null || PIPEFAIL.test(command)) {
    return false;
  }
  return command.split(SEGMENTS).some((segment) => {
    const [head, ...piped] = segment.split("|");
    return (
      head !== undefined &&
      piped.length > 0 &&
      runsACheck(head) &&
      piped.some((part) => TRIMMER.test(part))
    );
  });
};
