// Assembles everything the desktop app bundles besides its own main process: the office UI, sprites, image
// build contexts (with the compiled ho-runner and role skill packs), database migrations and the app icon.
// Output: apps/desktop/resources/ho (mirrors the repository paths @ho/daemon resolves) and
// apps/desktop/icon.iconset. Both are git-ignored; `bun run desktop:dev|build` runs this first.
import { $ } from "bun";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { drawIcon, ICONSET_FILES, scaleNearest } from "./lib/desktop-icon.ts";
import { encodePng } from "./lib/png.ts";

const root = resolve(import.meta.dir, "..");
const desktop = resolve(root, "apps/desktop");
const out = resolve(desktop, "resources/ho");
const at = (...parts: string[]): string => resolve(root, ...parts);
const say = (text: string): void => {
  process.stdout.write(`desktop-prepare: ${text}\n`);
};

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// 1. Office UI bundle and sprite manifest.
await $`bun run ${at("scripts/ui-build.ts")}`.cwd(root);
await $`bun run ${at("scripts/assets-manifest.ts")}`.cwd(root);
await cp(at("packages/ui/dist"), resolve(out, "packages/ui/dist"), { recursive: true });
await cp(at("assets/src"), resolve(out, "assets/src"), { recursive: true });
await cp(at("assets/dist"), resolve(out, "assets/dist"), { recursive: true });
say("ui bundle and sprites copied");

// 2. Image build contexts: Dockerfiles as in the repository, plus the runner binary and skill packs the
//    daemon would otherwise produce at build time (the packaged app has neither sources nor `bun`).
await cp(at("images/git-bridge"), resolve(out, "images/git-bridge"), { recursive: true });
await cp(at("images/agent"), resolve(out, "images/agent"), {
  recursive: true,
  filter: (source) => !/\/images\/agent\/(?:bin|plugins)(?:\/|$)/u.test(source),
});
await cp(at("packages/agent-kit/plugins"), resolve(out, "images/agent/plugins"), {
  recursive: true,
});
const runner = resolve(out, "images/agent/bin/ho-runner");
await mkdir(resolve(out, "images/agent/bin"), { recursive: true });
await $`bun build --compile --minify --target=bun-linux-arm64-musl ${at("packages/runner/src/main.ts")} --outfile ${runner}`
  .cwd(root)
  .quiet();
say("image contexts assembled (ho-runner compiled for linux/arm64 musl)");

// 3. Database migrations.
await cp(at("packages/store/drizzle"), resolve(out, "packages/store/drizzle"), { recursive: true });

// 4. App icon: pixel-art building at every size iconutil wants.
const iconset = resolve(desktop, "icon.iconset");
await rm(iconset, { recursive: true, force: true });
await mkdir(iconset, { recursive: true });
const base = drawIcon();
for (const { name, size } of ICONSET_FILES) {
  await Bun.write(resolve(iconset, name), encodePng(scaleNearest(base, size / base.width)));
}
say(`icon.iconset written (${String(ICONSET_FILES.length)} sizes)`);
say(`resources ready at ${out}`);
