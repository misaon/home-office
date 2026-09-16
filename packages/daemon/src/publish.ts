import { patchTaskArtifacts } from "@ho/core";
import { githubRepoFromUrl, HUMAN_ACTOR, type Project, type Task, type TaskId } from "@ho/protocol";
import { exec } from "./host-exec.ts";
import { daemonLog } from "./logger.ts";
import { pushLocalBranch, pushMirrorBranch } from "./mirrors.ts";
import type { Office } from "./office.ts";

const GH_TIMEOUT_MS = 120_000;

export type Published = { branch: string; prUrl: string | null };

const UNSEEN = /could not resolve to a repository|not found|HTTP 404/iu;

let signedIn: Promise<string[]> | null = null;
let worked: string | null = null;

const readAccounts = async (): Promise<string[]> => {
  const status = await exec(["gh", "auth", "status"], { timeoutMs: 10_000 });
  const seen = `${status.stdout}\n${status.stderr}`;
  return [...seen.matchAll(/account (?<name>[\w.-]+)/gu)]
    .map((found) => found.groups?.["name"] ?? "")
    .filter((name) => name !== "");
};

const accounts = (): Promise<string[]> => {
  signedIn ??= readAccounts().catch(() => []);
  return signedIn;
};

const tokenFor = async (account: string): Promise<string | null> => {
  const result = await exec(["gh", "auth", "token", "--user", account], {
    timeoutMs: 10_000,
    secret: true,
  });
  return result.code === 0 && result.stdout !== "" ? result.stdout : null;
};

async function gh(args: readonly string[], cwd: string | undefined, what: string): Promise<string> {
  const known = worked === null ? null : await tokenFor(worked);
  const first = await exec(["gh", ...args], {
    cwd,
    timeoutMs: GH_TIMEOUT_MS,
    ...(known === null ? {} : { env: { GH_TOKEN: known, GITHUB_TOKEN: known } }),
  });
  if (first.code === 0) {
    return first.stdout;
  }
  const complaint = first.stderr || first.stdout;
  if (!UNSEEN.test(complaint)) {
    throw new Error(`gh ${what} failed (${String(first.code)}): ${complaint.slice(0, 500)}`);
  }
  for (const account of await accounts()) {
    if (account === worked) {
      continue;
    }
    const token = await tokenFor(account);
    if (token === null) {
      continue;
    }
    const again = await exec(["gh", ...args], {
      cwd,
      timeoutMs: GH_TIMEOUT_MS,
      env: { GH_TOKEN: token, GITHUB_TOKEN: token },
    });
    if (again.code === 0) {
      worked = account;
      daemonLog()?.info({ account, what }, "gh fell back to another signed-in account");
      return again.stdout;
    }
  }
  const tried = await accounts();
  const names = tried.join(", ");
  throw new Error(
    `gh ${what} failed (${String(first.code)}): ${complaint.slice(0, 400)}\n  tried every signed-in account (${names === "" ? "none found" : names}); none can see this repository`,
  );
}

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
