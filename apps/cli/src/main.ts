#!/usr/bin/env bun
import { errorMessage } from "@ho/protocol";
import { run } from "./cli.ts";
import { COMMANDS } from "./commands/index.ts";
import { fail } from "./output.ts";

const DROPPED = [
  /AsyncIdQueue/u,
  /closed or aborted/u,
  /WebSocket is closed/iu,
  /ECONNREFUSED/u,
  /socket hang up/iu,
];

const explain = (error: unknown): string => {
  const message = errorMessage(error);
  return DROPPED.some((pattern) => pattern.test(message))
    ? `the daemon stopped while this command was running (${message.split("\n")[0] ?? ""})\n  whatever it had finished is kept; start the daemon again and re-run this`
    : message;
};

try {
  await run(COMMANDS, process.argv.slice(2));
} catch (error) {
  fail(explain(error));
}
