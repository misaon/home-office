#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const build = resolve(root, "apps/desktop/build/stable-macos-arm64");
const app = resolve(build, "Home Office.app");
const dmg = resolve(root, "apps/desktop/artifacts/macos-arm64-HomeOffice.dmg");

if (!existsSync(app)) {
  throw new Error(`no application bundle at ${app}; run \`bun run desktop:build\` first`);
}

await $`codesign --force --deep --sign - ${app}`.quiet();
await $`codesign --verify --deep --strict ${app}`.quiet();
const described = await $`codesign -dv --verbose=2 ${app}`.quiet().nothrow();
const report = described.stderr.toString();
if (!report.includes("Sealed Resources")) {
  throw new Error(`the bundle is still unsealed after signing:\n${report}`);
}

const staging = await mkdtemp(resolve(root, "apps/desktop/.dmg-"));
try {
  await $`cp -R ${app} ${staging}/`.quiet();
  await symlink("/Applications", resolve(staging, "Applications"));
  await $`hdiutil create -volname ${"Home Office"} -srcfolder ${staging} -ov -format UDZO ${dmg}`.quiet();
} finally {
  await rm(staging, { recursive: true, force: true });
}

const { size } = Bun.file(dmg);
process.stdout.write(
  `desktop-sign: bundle sealed ad-hoc, disk image rebuilt (${String(Math.round(size / 1024 / 1024))} MB)\n`,
);
