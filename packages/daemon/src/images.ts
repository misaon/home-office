import type { ImageSpec, SandboxProvider } from "@ho/core";
import { createDockerApi } from "@ho/sandbox-docker";
import { $, CryptoHasher, Glob } from "bun";
import { existsSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { DaemonConfig } from "./config.ts";
import { imageHash } from "./images-hash.ts";
import type { Resources } from "./paths.ts";

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

/**
 * Compiles ho-runner for the Alpine arm64 sandbox into the agent image build context. Packaged builds ship
 * the binary inside the context (no sources, no `bun` on PATH), so the step only checks that it is there.
 */
async function ensureRunner(resources: Resources, onLine?: (line: string) => void): Promise<void> {
  const target = join(resources.imageContext("agent"), RUNNER_IN_CONTEXT);
  if (resources.runnerEntry === null) {
    if (!existsSync(target)) {
      throw new Error(`ho-runner binary missing from the bundled image context (${target})`);
    }
    return;
  }
  const result =
    await $`bun build --compile --minify --target=bun-linux-arm64-musl ${resources.runnerEntry} --outfile ${target}`
      .quiet()
      .nothrow();
  onLine?.(result.stdout.toString().trim());
  if (result.exitCode !== 0) {
    throw new Error(`runner build failed: ${result.stderr.toString().slice(-1000)}`);
  }
}

/** Copies the role skill packs from @ho/agent-kit into the build context (replacing the previous copy). */
async function syncPlugins(resources: Resources): Promise<void> {
  if (resources.pluginsSource === null) {
    return;
  }
  const target = join(resources.imageContext("agent"), PLUGINS_IN_CONTEXT);
  await rm(target, { recursive: true, force: true });
  await cp(resources.pluginsSource, target, { recursive: true });
}

async function agentImageSpec(config: DaemonConfig, resources: Resources): Promise<ImageSpec> {
  const context = resources.imageContext("agent");
  return {
    ref: config.docker.agentImage,
    contextDir: context,
    platform: config.docker.platform,
    labels: IMAGE_LABELS,
    contentHash: await hashTree(context),
  };
}

async function bridgeImageSpec(config: DaemonConfig, resources: Resources): Promise<ImageSpec> {
  const context = resources.imageContext("git-bridge");
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
  resources: Resources,
  onLine?: (line: string) => void,
): Promise<void> {
  await ensureRunner(resources, onLine);
  await syncPlugins(resources);
  for (const spec of [
    await agentImageSpec(config, resources),
    await bridgeImageSpec(config, resources),
  ]) {
    onLine?.(`ensuring ${spec.ref} (${spec.contentHash})`);
    await provider.ensureImage(spec, (p) => onLine?.(p.line));
  }
}

export type ImageStatus = { ref: string; present: boolean; upToDate: boolean };

/** Whether each image exists locally and was built from the current build context. */
export async function imageStatus(
  config: DaemonConfig,
  resources: Resources,
): Promise<ImageStatus[]> {
  const api = createDockerApi(config.docker.socket);
  const specs = [await agentImageSpec(config, resources), await bridgeImageSpec(config, resources)];
  return Promise.all(
    specs.map(async (spec) => {
      const hash = await imageHash(api, spec.ref);
      return { ref: spec.ref, present: hash !== null, upToDate: hash === spec.contentHash };
    }),
  );
}
