const IDLE_WAIT_MIN_SECONDS = 15;
const SLEEP = /(?:^|[;&|(]\s*)sleep\s+(?<seconds>\d+(?:\.\d+)?)(?<unit>[smh])?\b/gu;
const CHECK_RUNNER =
  /\b(?:npm|pnpm|yarn|bun|npx|composer|php|phpunit|vendor\/bin\/\w+|pytest|python3?|cargo|go|make|gradle|mvn|dotnet|swift|xcodebuild)\b/u;
const PIPED_TO_TRIMMER = /\|\s*(?:tail|head)\b/u;
const PIPEFAIL = /pipefail/u;

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

export const masksExitCode = (tool: string, input: unknown): boolean => {
  const command = commandOf(tool, input);
  return (
    command !== null &&
    CHECK_RUNNER.test(command) &&
    PIPED_TO_TRIMMER.test(command) &&
    !PIPEFAIL.test(command)
  );
};
