import { githubRepoFromUrl, type Project, type Task } from "@ho/protocol";
import { mustExec } from "./host-exec.ts";
import { pushLocalBranch, pushMirrorBranch } from "./mirrors.ts";

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

export async function publishTaskBranch(
  home: string,
  project: Project,
  task: Task,
  branch: string,
  report: string,
): Promise<Published> {
  await pushBranchToOrigin(home, project, branch);
  return { branch, prUrl: await openPullRequest(project, task, branch, report) };
}
