import process from "node:process";

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

const idleWaitSeconds = (command: string): number => {
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

const masksExitCode = (command: string): boolean =>
  !PIPEFAIL.test(command) &&
  command.split(SEGMENTS).some((segment) => {
    const [head, ...piped] = segment.split("|");
    return (
      head !== undefined &&
      piped.length > 0 &&
      runsACheck(head) &&
      piped.some((part) => TRIMMER.test(part))
    );
  });

const commandOf = (payload: unknown): string | null => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("tool_name" in payload) ||
    payload.tool_name !== "Bash" ||
    !("tool_input" in payload)
  ) {
    return null;
  }
  const input = payload.tool_input;
  if (typeof input !== "object" || input === null || !("command" in input)) {
    return null;
  }
  return typeof input.command === "string" ? input.command : null;
};

const refuse = (reason: string): never => {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
};

let payload: unknown = null;
try {
  payload = JSON.parse(await Bun.stdin.text());
} catch {
  process.exit(0);
}
const command = commandOf(payload);
if (command === null) {
  process.exit(0);
}
const idle = idleWaitSeconds(command);
if (idle > 0) {
  refuse(
    `The office refuses idle waits: this command sleeps ${String(idle)} seconds doing nothing. Run the long command in the background and let its tool result tell you when it finishes, or wait for a port with a bounded loop: for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:PORT/ && break; sleep 1; done`,
  );
}
if (masksExitCode(command)) {
  refuse(
    "The office refuses this pipe: | tail or | head after a check hides its exit code, so a failure reads as success. Run the check plainly and read its exit code, or prefix `set -o pipefail;` when you must trim the output.",
  );
}
process.exit(0);
