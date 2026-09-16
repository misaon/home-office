import type { SandboxProvider, SandboxSpec } from "@ho/core";
import type { TaskId } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { exec } from "./host-exec.ts";
import { LABELS } from "./labels.ts";
import { daemonLog } from "./logger.ts";

export const REPO_IN_VOLUME = "/work/repo";

export const branchFor = (taskId: TaskId): string => `ho/task-${taskId}`;

export type GitIdentity = { name: string; email: string };

let resolvedHostIdentity: Promise<GitIdentity | null> | null = null;

const readGitConfig = async (key: string): Promise<string> => {
  const result = await exec(["git", "config", "--get", key], { timeoutMs: 5000 });
  return result.stdout.trim();
};

const readHostIdentity = async (): Promise<GitIdentity | null> => {
  const [name, email] = await Promise.all([
    readGitConfig("user.name"),
    readGitConfig("user.email"),
  ]);
  return name === "" || email === "" ? null : { name, email };
};

export const hostGitIdentity = (): Promise<GitIdentity | null> => {
  resolvedHostIdentity ??= readHostIdentity().catch(() => null);
  return resolvedHostIdentity;
};

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
  ports: [],
});

const run = async (
  provider: SandboxProvider,
  spec: SandboxSpec,
): Promise<{ ok: boolean; message: string }> => {
  const started = Bun.nanoseconds();
  const result = await provider.run(spec);
  const outcome = {
    ok: result.exitCode === 0,
    message: result.stderr.trim() || result.stdout.trim(),
  };
  daemonLog()?.debug(
    {
      bridge: spec.name,
      cmd: spec.cmd,
      volume: spec.volumes[0]?.name,
      code: result.exitCode,
      ms: Math.round((Bun.nanoseconds() - started) / 1e6),
      message: outcome.message.slice(0, 400),
    },
    "git bridge",
  );
  return outcome;
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
