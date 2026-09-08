import { $, Glob } from "bun";
import { existsSync } from "node:fs";

const configs = [...new Glob("{apps,packages,spikes}/*/tsconfig.json").scanSync(".")].toSorted();
for (const config of configs) {
  const dir = config.slice(0, config.lastIndexOf("/"));
  if (existsSync(`${dir}/hutch.config.ts`) && !existsSync(`${dir}/.hutch/devkit`)) {
    throw new Error(`Missing desktop devkit: run hutch electrobun sync in ${dir}`);
  }
}
const targets = ["tsconfig.json", ...configs];

const results: { config: string; code: number; out: string }[] = [];
const pending = [...targets];
await Promise.all(
  Array.from({ length: Math.min(4, targets.length) }, async () => {
    while (pending.length > 0) {
      const config = pending.shift();
      if (config === undefined) {
        return;
      }
      const result = await $`tsc -p ${config} --pretty`.nothrow().quiet();
      results.push({
        config,
        code: result.exitCode,
        out: result.stdout.toString() + result.stderr.toString(),
      });
    }
  }),
);
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
