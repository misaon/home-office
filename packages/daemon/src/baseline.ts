import type { SandboxProvider, SandboxRunResult } from "@ho/core";
import type { Baseline, Mandate, Project } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { inspectWorkingTree, prepareRepo } from "./git-bridge.ts";
import { LABELS } from "./labels.ts";
import { sourcePathFor } from "./mirrors.ts";
import { elapsedMs } from "./timing.ts";
import { commandSpec } from "./verify.ts";
import { CACHE_IN_VOLUME, cacheVolumeFor } from "./volumes.ts";

const SUFFIX_CHARS = 12;
const TAIL_MAX = 2000;
const MIN_STEP_MS = 1000;

type Check = Baseline["checks"][number];

const tailOf = (result: SandboxRunResult): string =>
  `${result.stdout}\n${result.stderr}`.trim().slice(-TAIL_MAX);

export const baselineWorthRunning = (project: Project): boolean =>
  project.verify.command !== "" ||
  project.environment.setup.length > 0 ||
  Object.keys(project.environment.checks).length > 0;

const plannedChecks = (project: Project): { name: string; command: string }[] => [
  ...Object.entries(project.environment.checks).map(([name, command]) => ({ name, command })),
  ...(project.verify.command === "" ? [] : [{ name: "verify", command: project.verify.command }]),
];

async function runSetup(
  provider: SandboxProvider,
  config: DaemonConfig,
  project: Project,
  volume: string,
): Promise<Baseline["setup"]> {
  const started = Bun.nanoseconds();
  const budgetMs = project.environment.timeoutSeconds * 1000;
  let tail = "";
  for (const command of project.environment.setup) {
    const result = await provider.run(
      commandSpec(config, volume, "baseline-setup", command, config.docker.network, [
        { name: cacheVolumeFor(project.id), target: CACHE_IN_VOLUME },
      ]),
      Math.max(MIN_STEP_MS, budgetMs - elapsedMs(started)),
    );
    tail = tailOf(result);
    if (result.exitCode !== 0) {
      return { ok: false, ms: elapsedMs(started), tail: `\`${command}\` failed: ${tail}` };
    }
  }
  return { ok: true, ms: elapsedMs(started), tail };
}

async function runChecks(
  provider: SandboxProvider,
  config: DaemonConfig,
  project: Project,
  volume: string,
): Promise<Check[]> {
  const outcomes: Check[] = [];
  for (const check of plannedChecks(project)) {
    const started = Bun.nanoseconds();
    const result = await provider.run(
      commandSpec(config, volume, `baseline-${check.name}`, check.command, "none"),
      project.verify.timeoutSeconds * 1000,
    );
    outcomes.push({
      ...check,
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      ms: elapsedMs(started),
      tail: tailOf(result),
    });
  }
  return outcomes;
}

export async function runBaseline(
  provider: SandboxProvider,
  config: DaemonConfig,
  home: string,
  project: Project,
  mandate: Pick<Mandate, "id">,
  now: () => string,
): Promise<Baseline> {
  const volume = `ho-baseline-${mandate.id.slice(-SUFFIX_CHARS)}`;
  const sourcePath = await sourcePathFor(home, project);
  await provider.createVolume(volume, {
    [LABELS.managed]: "true",
    [LABELS.kind]: "baseline-volume",
    [LABELS.project]: project.id,
  });
  try {
    await prepareRepo(
      provider,
      config,
      { path: sourcePath, defaultBranch: project.defaultBranch },
      volume,
      project.defaultBranch,
      { branch: project.defaultBranch, alsoFetch: [] },
    );
    const tree = await inspectWorkingTree(provider, config, volume);
    const setup = await runSetup(provider, config, project, volume);
    const checks = setup.ok ? await runChecks(provider, config, project, volume) : [];
    return { at: now(), commit: tree.sha, setup, checks };
  } finally {
    await provider.removeVolume(volume).catch(() => null);
  }
}
