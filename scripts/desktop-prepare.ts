import { $ } from "bun";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const out = resolve(root, "apps/desktop/resources/ho");
const at = (...parts: string[]): string => resolve(root, ...parts);
const say = (text: string): void => {
  process.stdout.write(`desktop-prepare: ${text}\n`);
};

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await $`bun run ${at("scripts/ui-build.ts")}`.cwd(root);
await cp(at("packages/ui/dist"), resolve(out, "packages/ui/dist"), { recursive: true });
say("ui bundle copied");

await cp(at("images/git-bridge"), resolve(out, "images/git-bridge"), { recursive: true });
await cp(at("images/agent"), resolve(out, "images/agent"), {
  recursive: true,
  filter: (source) =>
    !source.split("/").includes("node_modules") && !/\/images\/agent\/bin(?:\/|$)/u.test(source),
});
const runner = resolve(out, "images/agent/bin/ho-runner.js");
await mkdir(resolve(out, "images/agent/bin"), { recursive: true });
await $`bun build --target=bun --minify ${at("packages/runner/src/main.ts")} --outfile ${runner}`
  .cwd(root)
  .quiet();
say("image contexts assembled (ho-runner bundled for the image's own Bun)");
say(`resources ready at ${out}`);
