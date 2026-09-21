import type { SandboxProvider } from "@ho/core";
import type { CommitSha, Mandate, Project, Task } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { inRepo, inspectWorkingTree, prepareRepo, pushFromVolume, run } from "./git-bridge.ts";
import { LABELS } from "./labels.ts";
import { pushMirrorBranch, sourcePathFor } from "./mirrors.ts";
import { runVerify } from "./verify.ts";

const SUFFIX_CHARS = 12;
const OUTPUT_MAX = 2000;

const mandateBranchFor = (mandate: Pick<Mandate, "id">): string => `ho/mandate-${mandate.id}`;

const volumeFor = (mandate: Pick<Mandate, "id">): string =>
  `ho-mandate-${mandate.id.slice(-SUFFIX_CHARS)}`;

type Checks = { command: string; ok: boolean; output: string; ms: number };

export type Integration =
  | {
      kind: "integrated";
      branch: string;
      commit: CommitSha;
      merged: CommitSha[];
      checks: Checks | null;
    }
  | { kind: "conflict"; branch: string; task: Task; output: string };

const inDependencyOrder = (tasks: readonly Task[]): Task[] => {
  const pending = new Map(tasks.map((task) => [task.id, task]));
  const ordered: Task[] = [];
  while (pending.size > 0) {
    const ready = [...pending.values()]
      .filter((task) => task.dependsOn.every((id) => !pending.has(id)))
      .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
    const next = ready[0] ?? [...pending.values()][0];
    if (next === undefined) {
      break;
    }
    pending.delete(next.id);
    ordered.push(next);
  }
  return ordered;
};

const MERGE_IDENTITY = [
  "-c",
  "user.name=Home Office",
  "-c",
  "user.email=office@agents.home-office.local",
];

async function mergeAll(
  provider: SandboxProvider,
  config: DaemonConfig,
  volume: string,
  tasks: readonly Task[],
): Promise<{ task: Task; output: string } | null> {
  for (const task of tasks) {
    const { commit } = task.artifacts;
    if (commit === undefined) {
      continue;
    }
    const merged = await run(
      provider,
      inRepo(config, volume, "merge", [...MERGE_IDENTITY, "merge", "--no-edit", "-q", commit]),
    );
    if (!merged.ok) {
      await run(provider, inRepo(config, volume, "abort", ["merge", "--abort"]));
      return { task, output: merged.message.slice(-OUTPUT_MAX) };
    }
  }
  return null;
}

export async function integrateMandate(
  provider: SandboxProvider,
  config: DaemonConfig,
  home: string,
  project: Project,
  mandate: Mandate,
  done: readonly Task[],
): Promise<Integration> {
  const tasks = inDependencyOrder(done);
  const merged = tasks.flatMap((task) =>
    task.artifacts.commit === undefined ? [] : [task.artifacts.commit],
  );
  const [only] = tasks;
  if (
    tasks.length === 1 &&
    only?.artifacts.branch !== undefined &&
    only.artifacts.commit !== undefined
  ) {
    return {
      kind: "integrated",
      branch: only.artifacts.branch,
      commit: only.artifacts.commit,
      merged,
      checks: null,
    };
  }
  const branch = mandateBranchFor(mandate);
  const volume = volumeFor(mandate);
  const sourcePath = await sourcePathFor(home, project);
  await provider.createVolume(volume, {
    [LABELS.managed]: "true",
    [LABELS.kind]: "mandate-volume",
    [LABELS.project]: project.id,
  });
  try {
    await prepareRepo(
      provider,
      config,
      { path: sourcePath, defaultBranch: project.defaultBranch },
      volume,
      branch,
      {
        branch: project.defaultBranch,
        alsoFetch: tasks.flatMap((task) =>
          task.artifacts.branch === undefined ? [] : [task.artifacts.branch],
        ),
      },
    );
    const conflict = await mergeAll(provider, config, volume, tasks);
    if (conflict !== null) {
      return { kind: "conflict", branch, task: conflict.task, output: conflict.output };
    }
    const tree = await inspectWorkingTree(provider, config, volume);
    const checks =
      project.verify.command === ""
        ? null
        : await runVerify(provider, config, project, volume, null).then((result) => ({
            command: project.verify.command,
            ok: result.ok,
            output: result.output,
            ms: result.ms,
          }));
    await pushFromVolume(provider, config, sourcePath, volume, branch, tree.sha);
    if (project.repo.kind === "git") {
      await pushMirrorBranch(home, project, branch);
    }
    return { kind: "integrated", branch, commit: tree.sha, merged, checks };
  } finally {
    await provider.removeVolume(volume).catch(() => null);
  }
}
