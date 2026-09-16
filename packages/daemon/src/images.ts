import type { Cancellation, ImageSpec, ReadModel, SandboxProvider } from "@ho/core";
import { imageRefFor, type ProviderId } from "@ho/protocol";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DaemonConfig } from "./config.ts";
import { contextHash } from "./image-context.ts";
import { LABELS } from "./labels.ts";
import type { Resources } from "./paths.ts";

const IMAGE_LABELS = { [LABELS.managed]: "true", [LABELS.kind]: "image" };
const RUNNER_IN_CONTEXT = "bin/ho-runner.js";

async function ensureRunner(
  context: string,
  resources: Resources,
  onLine: (line: string) => void,
): Promise<void> {
  const target = join(context, RUNNER_IN_CONTEXT);
  if (resources.runnerEntry === null) {
    if (!existsSync(target)) {
      throw new Error(`ho-runner bundle missing from the bundled image context (${target})`);
    }
    return;
  }
  const result =
    await $`bun build --target=bun --minify ${resources.runnerEntry} --outfile ${target}`
      .quiet()
      .nothrow();
  onLine(result.stdout.toString().trim());
  if (result.exitCode !== 0) {
    throw new Error(`runner build failed: ${result.stderr.toString().slice(-1000)}`);
  }
}

export const neededVariants = (model: Pick<ReadModel, "agents">): ProviderId[] => [
  "claude-code",
  ...[...new Set([...model.agents.values()].map((a) => a.provider))].filter(
    (p): p is Exclude<ProviderId, "claude-code"> => p !== "claude-code",
  ),
];

async function imageSpecs(
  config: DaemonConfig,
  resources: Resources,
  variants: readonly ProviderId[],
): Promise<ImageSpec[] | null> {
  const agent = resources.imageContext("agent");
  const bridge = resources.imageContext("git-bridge");
  const agentHash = await contextHash(resources, "agent");
  const bridgeHash = await contextHash(resources, "git-bridge");
  if (agent === null || bridge === null || agentHash === null || bridgeHash === null) {
    return null;
  }
  return [
    ...variants.map((variant) => ({
      ref: imageRefFor(config.docker.agentImage, variant),
      contextDir: agent,
      target: variant,
      labels: IMAGE_LABELS,
      contentHash: agentHash,
    })),
    {
      ref: config.docker.bridgeImage,
      contextDir: bridge,
      labels: IMAGE_LABELS,
      contentHash: bridgeHash,
    },
  ];
}

export async function ensureImages(
  provider: SandboxProvider,
  config: DaemonConfig,
  resources: Resources,
  variants: readonly ProviderId[],
  onLine: (line: string) => void,
  signal?: Cancellation,
): Promise<void> {
  const context = resources.imageContext("agent");
  const specs = await imageSpecs(config, resources, variants);
  if (context === null || specs === null) {
    throw new Error(
      "this build carries no image build contexts; build the images from a source checkout or the desktop app",
    );
  }
  await ensureRunner(context, resources, onLine);
  for (const spec of specs) {
    onLine(`ensuring ${spec.ref} (${spec.contentHash})`);
    await provider.ensureImage(spec, onLine, signal);
  }
}

export type ImageStatus = { ref: string; present: boolean; upToDate: boolean };

export async function imageStatus(
  provider: SandboxProvider,
  config: DaemonConfig,
  resources: Resources,
  variants: readonly ProviderId[],
): Promise<ImageStatus[]> {
  const specs = await imageSpecs(config, resources, variants);
  if (specs === null) {
    return [];
  }
  return Promise.all(
    specs.map(async (spec) => {
      const hash = await provider.imageHash(spec.ref);
      return { ref: spec.ref, present: hash !== null, upToDate: hash === spec.contentHash };
    }),
  );
}
