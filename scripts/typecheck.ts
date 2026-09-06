import { $, Glob } from "bun";
import { existsSync } from "node:fs";

// Runs `tsc -p` for every workspace tsconfig concurrently (TypeScript 7 native compiler).
// Standalone Hutch projects (Electrobun) depend on a locally downloaded, git-ignored devkit; skip them until it exists.
const hasDevkit = (config: string): boolean => {
  const dir = config.slice(0, config.lastIndexOf("/"));
  return !existsSync(`${dir}/hutch.config.ts`) || existsSync(`${dir}/.hutch/devkit`);
};
const configs = [...new Glob("{apps,packages,spikes}/*/tsconfig.json").scanSync(".")]
  .filter((config) => hasDevkit(config))
  .toSorted();
const targets = ["tsconfig.json", ...configs];

const results = await Promise.all(
  targets.map(async (config) => {
    const result = await $`tsc -p ${config} --pretty`.nothrow().quiet();
    return {
      config,
      code: result.exitCode,
      out: result.stdout.toString() + result.stderr.toString(),
    };
  }),
);

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
