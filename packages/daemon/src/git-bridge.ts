import type { SandboxProvider, SandboxSpec } from "@ho/core";
import { CommitSha, type TaskId } from "@ho/protocol";
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

export type BridgeOutcome = { ok: boolean; message: string; stdout: string };

export const run = async (provider: SandboxProvider, spec: SandboxSpec): Promise<BridgeOutcome> => {
  const started = Bun.nanoseconds();
  const result = await provider.run(spec);
  const outcome = {
    ok: result.exitCode === 0,
    message: result.stderr.trim() || result.stdout.trim(),
    stdout: result.stdout,
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
): Promise<BridgeOutcome> => {
  const result = await run(provider, spec);
  if (!result.ok) {
    throw new Error(`git-bridge ${what} failed: ${result.message}`);
  }
  return result;
};

export const inRepo = (
  config: DaemonConfig,
  volume: string,
  step: string,
  cmd: readonly string[],
  source: Source = null,
): SandboxSpec =>
  bridgeSpec(config, `${volume}-${step}`, ["-C", REPO_IN_VOLUME, ...cmd], volume, source);

const fetchBranch = (
  config: DaemonConfig,
  volume: string,
  sourcePath: string,
  branch: string,
  into: string,
): SandboxSpec =>
  inRepo(
    config,
    volume,
    `fetch-${branch.replaceAll(/[^A-Za-z0-9]+/gu, "-").slice(-24)}`,
    ["fetch", "-q", "/src", `+refs/heads/${branch}:${into}`],
    { path: sourcePath, mode: "ro" },
  );

export type WorkingTree = { sha: CommitSha; dirty: string[] };

const OID_PREFIX = "# branch.oid ";

const entryPath = (entry: string): string => {
  const kind = entry.charAt(0);
  if (kind === "?" || kind === "!") {
    return entry.slice(2);
  }
  const skip = kind === "1" ? 8 : kind === "2" ? 9 : kind === "u" ? 10 : 1;
  return entry.split(" ").slice(skip).join(" ").split("\t")[0] ?? entry;
};

export async function inspectWorkingTree(
  provider: SandboxProvider,
  config: DaemonConfig,
  volume: string,
): Promise<WorkingTree> {
  const result = await runOrThrow(
    provider,
    inRepo(config, volume, "status", [
      "status",
      "--porcelain=v2",
      "--branch",
      "--untracked-files=all",
    ]),
    "status",
  );
  const lines = result.stdout.split("\n").filter((line) => line !== "");
  const sha = CommitSha.safeParse(
    lines.find((line) => line.startsWith(OID_PREFIX))?.slice(OID_PREFIX.length),
  );
  if (!sha.success) {
    throw new Error("git-bridge status: the repository has no commit at HEAD");
  }
  return {
    sha: sha.data,
    dirty: lines.filter((line) => !line.startsWith("#")).map((entry) => entryPath(entry)),
  };
}

export type RepoBase = { branch: string; alsoFetch: readonly string[] };

export async function prepareRepo(
  provider: SandboxProvider,
  config: DaemonConfig,
  source: { path: string; defaultBranch: string },
  volume: string,
  branch: string,
  base: RepoBase,
): Promise<void> {
  const probe = inRepo(config, volume, "probe", ["rev-parse", "--git-dir"]);
  const clone = (ref: string): SandboxSpec =>
    bridgeSpec(
      config,
      `${volume}-clone`,
      ["clone", "--no-hardlinks", "-q", "--branch", ref, "--single-branch", "/src", REPO_IN_VOLUME],
      volume,
      { path: source.path, mode: "ro" },
    );
  const probed = await run(provider, probe);
  const cloned = probed.ok ? probed : await run(provider, clone(branch));
  if (!cloned.ok) {
    await runOrThrow(provider, clone(base.branch), "clone");
    await runOrThrow(
      provider,
      inRepo(config, volume, "branch", ["checkout", "-q", "-b", branch]),
      "branch",
    );
  }
  for (const name of new Set([source.defaultBranch, ...base.alsoFetch])) {
    if (name !== branch) {
      await run(provider, fetchBranch(config, volume, source.path, name, `refs/heads/${name}`));
    }
  }
}

export const pushFromVolume = (
  provider: SandboxProvider,
  config: DaemonConfig,
  sourcePath: string,
  volume: string,
  branch: string,
  ref = "HEAD",
): Promise<BridgeOutcome> =>
  runOrThrow(
    provider,
    inRepo(config, volume, "push", ["push", "-q", "/src", `${ref}:refs/heads/${branch}`], {
      path: sourcePath,
      mode: "rw",
    }),
    "push",
  );

const CANDIDATE_REMOTE = "refs/remotes/candidate";

export async function prepareReviewCheckout(
  provider: SandboxProvider,
  config: DaemonConfig,
  source: { path: string; defaultBranch: string },
  volume: string,
  branch: string,
  commit: CommitSha | null,
): Promise<CommitSha> {
  const probed = await run(provider, inRepo(config, volume, "probe", ["rev-parse", "--git-dir"]));
  if (!probed.ok) {
    await runOrThrow(
      provider,
      bridgeSpec(
        config,
        `${volume}-clone`,
        [
          "clone",
          "--no-hardlinks",
          "-q",
          "--branch",
          branch,
          "--single-branch",
          "/src",
          REPO_IN_VOLUME,
        ],
        volume,
        { path: source.path, mode: "ro" },
      ),
      "clone",
    );
  }
  await runOrThrow(
    provider,
    fetchBranch(config, volume, source.path, branch, `${CANDIDATE_REMOTE}/${branch}`),
    "fetch",
  );
  await runOrThrow(
    provider,
    inRepo(config, volume, "checkout", [
      "checkout",
      "-q",
      "-f",
      "-B",
      branch,
      commit ?? `${CANDIDATE_REMOTE}/${branch}`,
    ]),
    "checkout",
  );
  await runOrThrow(provider, inRepo(config, volume, "clean", ["clean", "-fdq"]), "clean");
  if (source.defaultBranch !== branch) {
    await run(
      provider,
      fetchBranch(
        config,
        volume,
        source.path,
        source.defaultBranch,
        `refs/heads/${source.defaultBranch}`,
      ),
    );
  }
  const tree = await inspectWorkingTree(provider, config, volume);
  if (commit !== null && tree.sha !== commit) {
    throw new Error(`review checkout ended at ${tree.sha}, not at the candidate ${commit}`);
  }
  return tree.sha;
}
