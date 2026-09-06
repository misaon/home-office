import { OUT, writeManifest } from "./lib/manifest.ts";

const result = await writeManifest();
process.stdout.write(
  `${OUT}: ${String(result.sprites)} sprites, ${String(result.frames)} frames\n`,
);
if (result.problems.length > 0) {
  process.stdout.write(`ignored (bad name):\n  ${result.problems.join("\n  ")}\n`);
  process.exitCode = 1;
}
