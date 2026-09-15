import type { SandboxProvider, SandboxSpec } from "@ho/core";
import type { TaskId } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { LABELS } from "./labels.ts";

export const REPO_IN_VOLUME = "/work/repo";

export const branchFor = (taskId: TaskId): string => `ho/task-${taskId}`;

type Source = { path: string; mode: "ro" | "rw" } | null;

const bridgeSpec = (
  config: DaemonConfig,
  name: string,
  cmd: readonly string[],
  volume: string,
  source: Source,
): SandboxSpec => ({
  name,
  image: config.docker.bridgeImage,
  cmd: ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...cmd],
  env: {},
  user: "1000:1000",
  workdir: "/work",
  labels: { [LABELS.managed]: "true", [LABELS.kind]: "bridge" },
  network: "none",
  volumes: [{ name: volume, target: "/work" }],
  binds:
    source === null
      ? []
      : [{ source: source.path, target: "/src", readonly: source.mode === "ro" }],
  tmpfs: { "/tmp": "rw,nosuid,size=64m" },
  limits: { memoryBytes: 512 * 1024 * 1024, cpus: 1, pids: 128 },
  readonlyRootfs: true,
});

const run = async (
  provider: SandboxProvider,
  spec: SandboxSpec,
): Promise<{ ok: boolean; message: string }> => {
  const result = await provider.run(spec);
  return { ok: result.exitCode === 0, message: result.stderr.trim() || result.stdout.trim() };
};

const runOrThrow = async (
  provider: SandboxProvider,
  spec: SandboxSpec,
  what: string,
): Promise<void> => {
  const result = await run(provider, spec);
  if (!result.ok) {
    throw new Error(`git-bridge ${what} failed: ${result.message}`);
  }
};

/**
 * Makes sure the task volume holds the repository on the task branch. A fresh task clones the default branch
 * and creates the branch; a task whose branch already exists in the source (resumed after GC, or under review)
 * clones that branch directly.
 */
export async function prepareRepo(
  provider: SandboxProvider,
  config: DaemonConfig,
  sourcePath: string,
  defaultBranch: string,
  volume: string,
  branch: string,
): Promise<void> {
  const probe = bridgeSpec(
    config,
    `${volume}-probe`,
    ["-C", REPO_IN_VOLUME, "rev-parse", "--git-dir"],
    volume,
    null,
  );
  const probed = await run(provider, probe);
  if (probed.ok) {
    return;
  }
  const clone = (ref: string): SandboxSpec =>
    bridgeSpec(
      config,
      `${volume}-clone`,
      ["clone", "--no-hardlinks", "-q", "--branch", ref, "--single-branch", "/src", REPO_IN_VOLUME],
      volume,
      { path: sourcePath, mode: "ro" },
    );
  const cloned = await run(provider, clone(branch));
  if (cloned.ok) {
    return;
  }
  await runOrThrow(provider, clone(defaultBranch), "clone");
  await runOrThrow(
    provider,
    bridgeSpec(
      config,
      `${volume}-branch`,
      ["-C", REPO_IN_VOLUME, "checkout", "-q", "-b", branch],
      volume,
      null,
    ),
    "branch",
  );
}

/** Pushes the task branch back into the source repository. The agent never had this read-write mount. */
export const pushFromVolume = (
  provider: SandboxProvider,
  config: DaemonConfig,
  sourcePath: string,
  volume: string,
  branch: string,
): Promise<void> =>
  runOrThrow(
    provider,
    bridgeSpec(
      config,
      `${volume}-push`,
      ["-C", REPO_IN_VOLUME, "push", "-q", "/src", `HEAD:refs/heads/${branch}`],
      volume,
      { path: sourcePath, mode: "rw" },
    ),
    "push",
  );
