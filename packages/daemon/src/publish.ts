import type { Project, Task, TaskArtifacts } from "@ho/protocol";
import type { Logger } from "./logger.ts";
import { pushLocalBranch, pushMirrorBranch } from "./mirrors.ts";

/** `owner/name` for GitHub URLs (https or ssh); null for anything else. */
const githubRepoFromUrl = (url: string): string | null => {
  const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(url);
  return match === null ? null : `${match[1] ?? ""}/${match[2] ?? ""}`;
};

const run = async (argv: readonly string[], cwd?: string): Promise<string> => {
  const proc = Bun.spawn([...argv], {
    stdout: "pipe",
    stderr: "pipe",
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
 * Opens a pull request with the host's `gh` after the branch reached the remote. Never fails the task:
 * the branch is the deliverable, the PR is a convenience.
 */
export async function openPullRequest(
  home: string,
  project: Project,
  task: Task,
  branch: string,
  report: string,
  log: Logger,
): Promise<TaskArtifacts> {
  const artifacts: TaskArtifacts = { branch, report };
  if (project.publish.mode !== "pull-request") {
    return artifacts;
  }
  try {
    if (project.repo.kind === "local") {
      await pushLocalBranch(project, branch);
    } else {
      await pushMirrorBranch(home, project, branch);
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
    const url =
      (await run(args, cwd)).split("\n").findLast((line) => line.startsWith("https://")) ?? "";
    return url === "" ? artifacts : { ...artifacts, prUrl: url };
  } catch (error) {
    log.warn(
      { taskId: task.id, err: error instanceof Error ? error.message : String(error) },
      "pull request not created",
    );
    return artifacts;
  }
}
