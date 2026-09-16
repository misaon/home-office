import { $, Glob } from "bun";
import { existsSync } from "node:fs";

const configs = [...new Glob("{apps,packages}/*/tsconfig.json").scanSync(".")].toSorted();
for (const config of new Glob("apps/*/hutch.config.ts").scanSync(".")) {
  if (!existsSync(`${config.slice(0, config.lastIndexOf("/"))}/.hutch/devkit`)) {
    throw new Error("Missing desktop devkit: run bun run devkit first");
  }
}

const MAX_PARALLEL = 4;
type Result = { config: string; code: number; out: string };
const queue = ["tsconfig.json", ...configs];
const results: Result[] = [];
const worker = async (): Promise<void> => {
  for (let config = queue.shift(); config !== undefined; config = queue.shift()) {
    const result = await $`tsc -p ${config} --pretty`.nothrow().quiet();
    results.push({
      config,
      code: result.exitCode,
      out: result.stdout.toString() + result.stderr.toString(),
    });
  }
};
await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, worker));
results.sort((a, b) => a.config.localeCompare(b.config));
let failed = false;
for (const { config, code, out } of results) {
  if (code === 0) {
    process.stdout.write(`✔ ${config}\n`);
  } else {
    failed = true;
    process.stdout.write(`✖ ${config}\n${out}\n`);
  }
}
process.exit(failed ? 1 : 0);
