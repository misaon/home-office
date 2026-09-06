import { describeManifest, writeManifest } from "./lib/manifest.ts";

const result = await writeManifest();
process.stdout.write(describeManifest(result));
if (result.problems.length > 0) {
  process.exitCode = 1;
}
