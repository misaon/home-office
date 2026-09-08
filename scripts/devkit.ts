import { $ } from "bun";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";

const REVISION = "5668321389b6f47e24a2408c963ef5a437793b4c";
const ARCHIVES: Record<string, { platform: string; sha256: string }> = {
  "darwin-arm64": {
    platform: "macos-arm64",
    sha256: "521828934a4524a2f745b24a1843d7fde61a6b5ec355c9d3fe331168f5fadbc3",
  },
  "linux-x64": {
    platform: "linux-x64",
    sha256: "32c9c471b13d2a1705d797f0012edd8ca6c82864da37310afa5d82658c418076",
  },
  "linux-arm64": {
    platform: "linux-arm64",
    sha256: "4cc8fe8229c142a1f2a2f82f89b5e98c32e0f2a09b33a398d74d97577152d219",
  },
};
const root = resolve(import.meta.dir, "..");
const archive = ARCHIVES[`${process.platform}-${process.arch}`];
if (archive === undefined) {
  throw new Error("Hutch setup supports macOS arm64 and Linux x64/arm64");
}
const target = resolve(root, `.tools/hutch-${REVISION}-${archive.platform}`);
const binary = resolve(target, "bin/hutch");
if (!(await Bun.file(binary).exists())) {
  await mkdir(resolve(root, ".tools"), { recursive: true });
  const staging = await mkdtemp(resolve(root, ".tools/hutch-download-"));
  try {
    const response = await fetch(
      `https://hutch.blackboard.sh/hutch/builds/${REVISION}/${archive.platform}/hutch.tar.gz`,
      { signal: AbortSignal.timeout(60_000) },
    );
    if (!response.ok) {
      throw new Error(`Hutch download failed: ${String(response.status)}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== archive.sha256) {
      throw new Error("Hutch checksum mismatch");
    }
    const file = resolve(staging, "archive.tar.gz");
    await Bun.write(file, bytes);
    await $`tar -xzf ${file} --strip-components=1 -C ${staging}`;
    await rm(file);
    await rename(staging, target);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
const action = Bun.argv[2] ?? "sync";
if (!["sync", "dev", "build"].includes(action)) {
  throw new Error("expected sync, dev or build");
}
const desktop = resolve(root, "apps/desktop");
await $`${binary} electrobun sync`.cwd(desktop);
if (action !== "sync") {
  const args = action === "build" ? ["build", "--env=stable"] : ["dev"];
  await $`${binary} electrobun ${args}`.cwd(desktop);
}
