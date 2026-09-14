#!/usr/bin/env bun
import { errorMessage } from "@ho/protocol";
import { run } from "./cli.ts";
import { COMMANDS } from "./commands/index.ts";
import { fail } from "./output.ts";

try {
  await run(COMMANDS, process.argv.slice(2));
} catch (error) {
  fail(errorMessage(error));
}
