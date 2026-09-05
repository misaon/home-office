import { $, Glob } from "bun";

// Runs `tsc -p` for every workspace tsconfig concurrently (TypeScript 7 native compiler).
const configs = [...new Glob("{apps,packages,spikes}/*/tsconfig.json").scanSync(".")].toSorted();
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
