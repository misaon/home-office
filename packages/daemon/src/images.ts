import type { ImageSpec, SandboxProvider } from "@ho/core";
import { $, CryptoHasher, Glob } from "bun";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { DaemonConfig } from "./config.ts";
import { imageContext, repoRoot } from "./paths.ts";

export const LABELS = {
  managed: "ho.managed",
  kind: "ho.kind",
  session: "ho.session",
  project: "ho.project",
} as const;
const IMAGE_LABELS = { [LABELS.managed]: "true", [LABELS.kind]: "image" };
const RUNNER_IN_CONTEXT = "bin/ho-runner";
const PLUGINS_IN_CONTEXT = "plugins";

/** Hash of every file in a build context (sorted paths + contents): the image is rebuilt only when this changes. */
async function hashTree(dir: string): Promise<string> {
  const hasher = new CryptoHasher("sha256");
  const files = [
    ...new Glob("**/*").scanSync({ cwd: dir, onlyFiles: true, dot: false }),
  ].toSorted();
  for (const relative of files) {
    hasher.update(relative);
    hasher.update(new Uint8Array(await Bun.file(join(dir, relative)).arrayBuffer()));
  }
  return hasher.digest("hex").slice(0, 32);
}

/** Compiles ho-runner for the Alpine arm64 sandbox into the agent image build context. */
async function buildRunner(onLine?: (line: string) => void): Promise<void> {
  const target = join(imageContext("agent"), RUNNER_IN_CONTEXT);
  const entry = join(repoRoot(), "packages/runner/src/main.ts");
  const result =
    await $`bun build --compile --minify --target=bun-linux-arm64-musl ${entry} --outfile ${target}`
      .quiet()
      .nothrow();
  onLine?.(result.stdout.toString().trim());
  if (result.exitCode !== 0) {
    throw new Error(`runner build failed: ${result.stderr.toString().slice(-1000)}`);
  }
}

/** Copies the role skill packs from @ho/agent-kit into the build context (replacing the previous copy). */
async function syncPlugins(): Promise<void> {
  const target = join(imageContext("agent"), PLUGINS_IN_CONTEXT);
  await rm(target, { recursive: true, force: true });
  await cp(join(repoRoot(), "packages/agent-kit/plugins"), target, { recursive: true });
}

export async function agentImageSpec(config: DaemonConfig): Promise<ImageSpec> {
  const context = imageContext("agent");
  return {
    ref: config.docker.agentImage,
    contextDir: context,
    platform: config.docker.platform,
    labels: IMAGE_LABELS,
    contentHash: await hashTree(context),
  };
}

export async function bridgeImageSpec(config: DaemonConfig): Promise<ImageSpec> {
  const context = imageContext("git-bridge");
  return {
    ref: config.docker.bridgeImage,
    contextDir: context,
    platform: config.docker.platform,
    labels: IMAGE_LABELS,
    contentHash: await hashTree(context),
  };
}

export async function ensureImages(
  provider: SandboxProvider,
  config: DaemonConfig,
  onLine?: (line: string) => void,
): Promise<void> {
  await buildRunner(onLine);
  await syncPlugins();
  for (const spec of [await agentImageSpec(config), await bridgeImageSpec(config)]) {
    onLine?.(`ensuring ${spec.ref} (${spec.contentHash})`);
    await provider.ensureImage(spec, (p) => onLine?.(p.line));
  }
}
