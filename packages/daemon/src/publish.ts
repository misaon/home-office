import { patchTaskArtifacts } from "@ho/core";
import { githubRepoFromUrl, HUMAN_ACTOR, type Project, type TaskId } from "@ho/protocol";
import { exec } from "./host-exec.ts";
import { daemonLog } from "./logger.ts";
import { pushLocalBranch, pushMirrorBranch } from "./mirrors.ts";
import type { Commands } from "./office.ts";

const GH_TIMEOUT_MS = 120_000;

export type Published = { branch: string; prUrl: string | null };

const UNSEEN = /could not resolve to a repository|not found|HTTP 404/iu;

type Accounts = { names: string[]; active: string | null };

let signedIn: Promise<Accounts> | null = null;
const worked = new Map<string, string>();

const readAccounts = async (): Promise<Accounts> => {
  const status = await exec(["gh", "auth", "status"], { timeoutMs: 10_000 });
  const names: string[] = [];
  let active: string | null = null;
  let current: string | null = null;
  for (const line of `${status.stdout}\n${status.stderr}`.split("\n")) {
    const name = /account (?<name>[\w.-]+)/u.exec(line)?.groups?.["name"];
    if (name !== undefined) {
      current = name;
      names.push(name);
    } else if (current !== null && /Active account: true/u.test(line)) {
      active = current;
    }
  }
  return { names, active };
};

const accounts = (): Promise<Accounts> => {
  signedIn ??= readAccounts().catch((): Accounts => ({ names: [], active: null }));
  return signedIn;
};

const tokenFor = async (account: string): Promise<string | null> => {
  const result = await exec(["gh", "auth", "token", "--user", account], {
    timeoutMs: 10_000,
    secret: true,
  });
  return result.code === 0 && result.stdout !== "" ? result.stdout : null;
};

const attempt = (
  args: readonly string[],
  cwd: string | undefined,
  token: string | null,
): ReturnType<typeof exec> =>
  exec(["gh", ...args], {
    cwd,
    timeoutMs: GH_TIMEOUT_MS,
    ...(token === null ? {} : { env: { GH_TOKEN: token, GITHUB_TOKEN: token } }),
  });

async function gh(
  args: readonly string[],
  cwd: string | undefined,
  what: string,
  scope: string,
): Promise<string> {
  const { names, active } = await accounts();
  const known = worked.get(scope) ?? null;
  const knownToken = known === null ? null : await tokenFor(known);
  const first = await attempt(args, cwd, knownToken);
  const used = knownToken === null ? active : known;
  if (first.code === 0) {
    if (used !== null) {
      worked.set(scope, used);
    }
    return first.stdout;
  }
  const complaint = first.stderr || first.stdout;
  if (!UNSEEN.test(complaint)) {
    throw new Error(`gh ${what} failed (${String(first.code)}): ${complaint.slice(0, 500)}`);
  }
  const failed = new Set(used === null ? [] : [used]);
  for (const account of names) {
    if (failed.has(account)) {
      continue;
    }
    const token = await tokenFor(account);
    if (token === null) {
      continue;
    }
    const again = await attempt(args, cwd, token);
    if (again.code === 0) {
      worked.set(scope, account);
      daemonLog()?.info({ account, what, scope }, "gh fell back to another signed-in account");
      return again.stdout;
    }
    failed.add(account);
  }
  const listed = names.length === 0 ? "none found" : names.join(", ");
  throw new Error(
    `gh ${what} failed (${String(first.code)}): ${complaint.slice(0, 400)}\n  tried every signed-in account (${listed}); none can see this repository`,
  );
}

type RepoTarget = { cwd: string | undefined; target: string[]; scope: string };

const repoTarget = (project: Project): RepoTarget => {
  if (project.repo.kind === "local") {
    return { cwd: project.repo.path, target: [], scope: project.repo.path };
  }
  const repo = githubRepoFromUrl(project.repo.url);
  if (repo === null) {
    throw new Error("pull requests need a GitHub URL");
  }
  return { cwd: undefined, target: ["--repo", repo], scope: repo.split("/")[0] ?? repo };
};

export type PullRequestContent = { title: string; body: string };

export async function openPullRequest(
  project: Project,
  content: PullRequestContent,
  branch: string,
): Promise<string | null> {
  const { cwd, target, scope } = repoTarget(project);
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
    scope,
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
      content.title,
      "--body",
      content.body,
      ...(project.publish.draft ? ["--draft"] : []),
      ...target,
    ],
    cwd,
    "pr create",
    scope,
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
  office: Commands,
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
  const body = task.artifacts.report ?? task.brief;
  const prUrl = await openPullRequest(
    project,
    { title: task.title, body: body === "" ? task.title : body },
    branch,
  );
  if (prUrl !== null) {
    await office.execute(HUMAN_ACTOR, (m, ctx) => patchTaskArtifacts(m, task.id, { prUrl }, ctx));
  }
  return { branch, prUrl };
}
