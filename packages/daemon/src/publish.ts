import { patchTaskArtifacts } from "@ho/core";
import { githubRepoFromUrl, HUMAN_ACTOR, type Project, type Task, type TaskId } from "@ho/protocol";
import { mustExec } from "./host-exec.ts";
import { pushLocalBranch, pushMirrorBranch } from "./mirrors.ts";
import type { Office } from "./office.ts";

const GH_TIMEOUT_MS = 120_000;

export type Published = { branch: string; prUrl: string | null };

const gh = (args: readonly string[], cwd: string | undefined, what: string): Promise<string> =>
  mustExec(["gh", ...args], { cwd, timeoutMs: GH_TIMEOUT_MS }, `gh ${what}`);

const repoTarget = (project: Project): { cwd: string | undefined; target: string[] } => {
  if (project.repo.kind === "local") {
    return { cwd: project.repo.path, target: [] };
  }
  const repo = githubRepoFromUrl(project.repo.url);
  if (repo === null) {
    throw new Error("pull requests need a GitHub URL");
  }
  return { cwd: undefined, target: ["--repo", repo] };
};

export async function openPullRequest(
  project: Project,
  task: Task,
  branch: string,
  report: string,
): Promise<string | null> {
  const { cwd, target } = repoTarget(project);
  const existing = await gh(
    [
      "pr",
      "list",
      ...target,
      "--head",
      branch,
      "--base",
      project.defaultBranch,
      "--state",
      "open",
      "--json",
      "url",
      "--jq",
      ".[0].url // empty",
    ],
    cwd,
    "pr list",
  );
  if (existing !== "") {
    return existing;
  }
  const created = await gh(
    [
      "pr",
      "create",
      "--head",
      branch,
      "--base",
      project.defaultBranch,
      "--title",
      task.title,
      "--body",
      report === "" ? task.brief : report,
      ...(project.publish.draft ? ["--draft"] : []),
      ...target,
    ],
    cwd,
    "pr create",
  );
  return created.split("\n").findLast((line) => line.startsWith("https://")) ?? null;
}

const pushBranchToOrigin = async (
  home: string,
  project: Project,
  branch: string,
): Promise<void> => {
  await (project.repo.kind === "git"
    ? pushMirrorBranch(home, project, branch)
    : pushLocalBranch(project.repo.path, branch));
};

export async function publishTask(
  office: Office,
  home: string,
  taskId: TaskId,
): Promise<Published> {
  const task = office.model.tasks.get(taskId);
  if (task === undefined) {
    throw new Error(`no such task: ${taskId}`);
  }
  const project = office.model.projects.get(task.projectId);
  if (project === undefined) {
    throw new Error(`the task's floor is gone: ${task.projectId}`);
  }
  const { branch } = task.artifacts;
  if (branch === undefined) {
    throw new Error("this task has no branch yet; nothing has been written for it");
  }
  await pushBranchToOrigin(home, project, branch);
  const prUrl = await openPullRequest(project, task, branch, task.artifacts.report ?? task.brief);
  if (prUrl !== null) {
    await office.execute(HUMAN_ACTOR, (m, ctx) => patchTaskArtifacts(m, task.id, { prUrl }, ctx));
  }
  return { branch, prUrl };
}
