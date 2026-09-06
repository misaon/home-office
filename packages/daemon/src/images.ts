import type { ImageSpec, SandboxProvider } from "@ho/core";
import { $, CryptoHasher } from "bun";
import { join } from "node:path";
import { imageContext, repoRoot } from "./paths.ts";
import type { DaemonConfig } from "./config.ts";

export const LABELS = {
  managed: "ho.managed",
  kind: "ho.kind",
  session: "ho.session",
  project: "ho.project",
} as const;
const IMAGE_LABELS = { [LABELS.managed]: "true", [LABELS.kind]: "image" };

const hashFiles = async (paths: readonly string[]): Promise<string> => {
  const hasher = new CryptoHasher("sha256");
  for (const path of paths) {
    const file = Bun.file(path);
    hasher.update(path);
    hasher.update((await file.exists()) ? new Uint8Array(await file.arrayBuffer()) : "missing");
  }
  return hasher.digest("hex").slice(0, 32);
};

const RUNNER_IN_CONTEXT = "bin/ho-runner";

/** Compiles ho-runner for the Alpine arm64 sandbox into the agent image build context. */
async function buildRunner(onLine?: (line: string) => void): Promise<string> {
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
  return target;
}

export async function agentImageSpec(config: DaemonConfig): Promise<ImageSpec> {
  const context = imageContext("agent");
  return {
    ref: config.docker.agentImage,
    contextDir: context,
    platform: config.docker.platform,
    labels: IMAGE_LABELS,
    contentHash: await hashFiles([join(context, "Dockerfile"), join(context, RUNNER_IN_CONTEXT)]),
  };
}

export async function bridgeImageSpec(config: DaemonConfig): Promise<ImageSpec> {
  const context = imageContext("git-bridge");
  return {
    ref: config.docker.bridgeImage,
    contextDir: context,
    platform: config.docker.platform,
    labels: IMAGE_LABELS,
    contentHash: await hashFiles([join(context, "Dockerfile")]),
  };
}

export async function ensureImages(
  provider: SandboxProvider,
  config: DaemonConfig,
  onLine?: (line: string) => void,
): Promise<void> {
  await buildRunner(onLine);
  for (const spec of [await agentImageSpec(config), await bridgeImageSpec(config)]) {
    onLine?.(`ensuring ${spec.ref} (${spec.contentHash})`);
    await provider.ensureImage(spec, (p) => onLine?.(p.line));
  }
}
