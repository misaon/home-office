#!/usr/bin/env bun
import { fail } from "./output.ts";
import { run } from "./commands/run.ts";

try {
  await run(process.argv.slice(2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
