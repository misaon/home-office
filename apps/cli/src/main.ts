#!/usr/bin/env bun
import { errorMessage } from "@ho/protocol";
import { fail } from "./output.ts";
import { run } from "./commands/run.ts";

try {
  await run(process.argv.slice(2));
} catch (error) {
  fail(errorMessage(error));
}
