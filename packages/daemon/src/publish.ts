import { githubRepoFromUrl } from "@ho/core";
import type { Project, Task, TaskArtifacts } from "@ho/protocol";
import { pushLocalBranch, pushMirrorBranch } from "./mirrors.ts";

const run = async (argv: readonly string[], cwd?: string): Promise<string> => {
  const proc = Bun.spawn([...argv], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
    env: { ...Bun.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" },
    ...(cwd === undefined ? {} : { cwd }),
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`${argv[0] ?? ""} failed (${String(code)}): ${stderr.trim() || stdout.trim()}`);
  }
  return stdout.trim();
};

/**
 * Delivers a finished branch: git-URL projects always get the branch on their remote (through the host
 * mirror, with the owner's credentials); `pull-request` projects additionally get a PR via the host's `gh`.
 */
export async function deliver(
  home: string,
  project: Project,
  task: Task,
  branch: string,
  report: string,
): Promise<TaskArtifacts> {
  const artifacts: TaskArtifacts = { branch, report };
  if (project.repo.kind === "git") {
    await pushMirrorBranch(home, project, branch);
  }
  if (project.publish.mode !== "pull-request") {
    return artifacts;
  }
  if (project.repo.kind === "local") {
    await pushLocalBranch(project, branch);
  }
  const args = [
    "gh",
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
  ];
  if (project.publish.draft) {
    args.push("--draft");
  }
  let cwd: string | undefined;
  if (project.repo.kind === "local") {
    cwd = project.repo.path;
  } else {
    const repo = githubRepoFromUrl(project.repo.url);
    if (repo === null) {
      throw new Error("pull requests need a GitHub URL");
    }
    args.push("--repo", repo);
  }
  const target =
    project.repo.kind === "local" ? [] : ["--repo", githubRepoFromUrl(project.repo.url) ?? ""];
  const existing = await run(
    [
      "gh",
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
  );
  const url =
    existing !== ""
      ? existing
      : ((await run(args, cwd)).split("\n").findLast((line) => line.startsWith("https://")) ?? "");
  return url === "" ? artifacts : { ...artifacts, prUrl: url };
}
