import type { ImageSpec, ReadModel, SandboxProvider } from "@ho/core";
import { imageRefFor, type ProviderId } from "@ho/protocol";
import { createDockerApi, imageHash } from "@ho/sandbox-docker";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { DaemonConfig } from "./config.ts";
import { contextHash } from "./image-context.ts";
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

/**
 * Compiles ho-runner for the Alpine arm64 sandbox into the agent image build context. Packaged builds ship
 * the binary inside the context (no sources, no `bun` on PATH), so the step only checks that it is there.
 */
async function ensureRunner(
  context: string,
  resources: Resources,
  onLine?: (line: string) => void,
): Promise<void> {
  const target = join(context, RUNNER_IN_CONTEXT);
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
async function syncPlugins(context: string, resources: Resources): Promise<void> {
  if (resources.pluginsSource === null) {
    return;
  }
  const target = join(context, PLUGINS_IN_CONTEXT);
  await rm(target, { recursive: true, force: true });
  await cp(resources.pluginsSource, target, { recursive: true });
}

/** Provider variants the roster needs: Claude Code always, plus every provider some agent uses. */
export const neededVariants = (model: Pick<ReadModel, "agents">): ProviderId[] => [
  "claude-code",
  ...[...new Set([...model.agents.values()].map((a) => a.provider))].filter(
    (p): p is Exclude<ProviderId, "claude-code"> => p !== "claude-code",
  ),
];

/** One spec per variant; they share the context (and its hash) and differ in build target and ref. */
async function agentImageSpecs(
  config: DaemonConfig,
  resources: Resources,
  variants: readonly ProviderId[],
): Promise<ImageSpec[] | null> {
  const context = resources.imageContext("agent");
  const contentHash = await contextHash(resources, "agent");
  if (context === null || contentHash === null) {
    return null;
  }
  return variants.map((variant) => ({
    ref: imageRefFor(config.docker.agentImage, variant),
    contextDir: context,
    target: variant,
    platform: config.docker.platform,
    labels: IMAGE_LABELS,
    contentHash,
  }));
}

async function bridgeImageSpec(
  config: DaemonConfig,
  resources: Resources,
): Promise<ImageSpec | null> {
  const context = resources.imageContext("git-bridge");
  const contentHash = await contextHash(resources, "git-bridge");
  if (context === null || contentHash === null) {
    return null;
  }
  return {
    ref: config.docker.bridgeImage,
    contextDir: context,
    platform: config.docker.platform,
    labels: IMAGE_LABELS,
    contentHash,
  };
}

/** Every image this build can build, or null when it carries no build contexts (a compiled CLI). */
async function imageSpecs(
  config: DaemonConfig,
  resources: Resources,
  variants: readonly ProviderId[],
): Promise<ImageSpec[] | null> {
  const agents = await agentImageSpecs(config, resources, variants);
  const bridge = await bridgeImageSpec(config, resources);
  return agents === null || bridge === null ? null : [...agents, bridge];
}

const NO_CONTEXT =
  "this build carries no image build contexts; build the images from a source checkout or the desktop app";

export async function ensureImages(
  provider: SandboxProvider,
  config: DaemonConfig,
  resources: Resources,
  variants: readonly ProviderId[],
  onLine?: (line: string) => void,
): Promise<void> {
  const context = resources.imageContext("agent");
  const specs = await imageSpecs(config, resources, variants);
  if (context === null || specs === null) {
    throw new Error(NO_CONTEXT);
  }
  await ensureRunner(context, resources, onLine);
  await syncPlugins(context, resources);
  for (const spec of specs) {
    onLine?.(`ensuring ${spec.ref} (${spec.contentHash})`);
    await provider.ensureImage(spec, (p) => onLine?.(p.line));
  }
}

export type ImageStatus = { ref: string; present: boolean; upToDate: boolean };

/** Whether each image exists locally and was built from the current build context; empty without contexts. */
export async function imageStatus(
  config: DaemonConfig,
  resources: Resources,
  variants: readonly ProviderId[],
): Promise<ImageStatus[]> {
  const specs = await imageSpecs(config, resources, variants);
  if (specs === null) {
    return [];
  }
  const api = createDockerApi(config.docker.socket);
  return Promise.all(
    specs.map(async (spec) => {
      const hash = await imageHash(api, spec.ref);
      return { ref: spec.ref, present: hash !== null, upToDate: hash === spec.contentHash };
    }),
  );
}
