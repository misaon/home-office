#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Seals the built application bundle and rebuilds the disk image around it.
 *
 * Hutch will code-sign only with a paid Developer ID (`ELECTROBUN_DEVELOPER_ID`, error
 * `MissingDeveloperId`), so the office builds with `codesign: false` — and an unsealed bundle is worse
 * than an unsigned one. The launcher carries the ad-hoc signature the linker puts on every arm64
 * binary, but the *bundle* has no `_CodeSignature`, so macOS reads a signature that claims resources it
 * cannot find and refuses the app as **damaged**, quarantine or no quarantine. Measured 2026-09-15:
 * `spctl --assess` answers "code has no resources but signature indicates they must be present" both
 * before and after `xattr -cr`, which is why clearing quarantine alone never helped.
 *
 * An ad-hoc signature does not make the app trusted — `spctl` still answers "rejected", which is the
 * ordinary unidentified-developer path a user can accept. It makes the app *coherent*, which is what
 * stands between "damaged, move to Trash" and an app that opens.
 */

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

// The disk image is built by Hutch from the unsigned bundle, so it carries one; this replaces it with
// the same layout — the application beside a link to /Applications — around the signed one.
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
