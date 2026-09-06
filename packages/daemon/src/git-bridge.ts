import type { SandboxProvider, SandboxSpec } from "@ho/core";
import type { TaskId } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { LABELS } from "./images.ts";

export const REPO_IN_VOLUME = "/work/repo";

const slug = (title: string): string =>
  title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 40) || "task";

export const branchFor = (title: string, taskId: TaskId): string =>
  `ho/${slug(title)}-${taskId.slice(-8)}`;

const bridgeSpec = (
  config: DaemonConfig,
  name: string,
  cmd: readonly string[],
  volume: string,
  source: { path: string; readonly: boolean } | null,
): SandboxSpec => ({
  name,
  image: config.docker.bridgeImage,
  cmd,
  env: {},
  user: "1000:1000",
  workdir: "/work",
  labels: { [LABELS.managed]: "true", [LABELS.kind]: "bridge" },
  network: "none",
  volumes: [{ name: volume, target: "/work" }],
  binds:
    source === null ? [] : [{ source: source.path, target: "/src", readonly: source.readonly }],
  tmpfs: { "/tmp": "rw,nosuid,size=64m" },
  limits: { memoryBytes: 512 * 1024 * 1024, cpus: 1, pids: 128 },
  readonlyRootfs: true,
});

const runOrThrow = async (
  provider: SandboxProvider,
  spec: SandboxSpec,
  what: string,
): Promise<void> => {
  const result = await provider.run(spec);
  if (result.exitCode !== 0) {
    throw new Error(
      `git-bridge ${what} failed (${String(result.exitCode)}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
};

/** Clones the source repository (host checkout or host mirror, mounted read-only) into the task volume on a new branch. */
export async function cloneIntoVolume(
  provider: SandboxProvider,
  config: DaemonConfig,
  sourcePath: string,
  defaultBranch: string,
  volume: string,
  branch: string,
): Promise<void> {
  const source = { path: sourcePath, readonly: true };
  await runOrThrow(
    provider,
    bridgeSpec(
      config,
      `${volume}-clone`,
      ["clone", "-q", "--branch", defaultBranch, "--single-branch", "/src", REPO_IN_VOLUME],
      volume,
      source,
    ),
    "clone",
  );
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
export async function pushFromVolume(
  provider: SandboxProvider,
  config: DaemonConfig,
  sourcePath: string,
  volume: string,
  branch: string,
): Promise<void> {
  await runOrThrow(
    provider,
    bridgeSpec(
      config,
      `${volume}-push`,
      ["-C", REPO_IN_VOLUME, "push", "-q", "-f", "/src", `HEAD:refs/heads/${branch}`],
      volume,
      { path: sourcePath, readonly: false },
    ),
    "push",
  );
}
