import { githubRepoFromUrl } from "@ho/core";
import type { Project, Task, TaskArtifacts } from "@ho/protocol";
import type { Logger } from "./logger.ts";
import { pushLocalBranch, pushMirrorBranch } from "./mirrors.ts";

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
 * Delivers a finished branch: git-URL projects always get the branch on their remote (through the host
 * mirror, with the owner's credentials); `pull-request` projects additionally get a PR via the host's `gh`.
 * Never fails the task: the branch in the source repository is the deliverable, the rest is convenience.
 */
export async function deliver(
  home: string,
  project: Project,
  task: Task,
  branch: string,
  report: string,
  log: Logger,
): Promise<TaskArtifacts> {
  const artifacts: TaskArtifacts = { branch, report };
  try {
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
    } else if (project.repo.kind === "git") {
      const repo = githubRepoFromUrl(project.repo.url);
      if (repo === null) {
        throw new Error("pull requests need a GitHub URL");
      }
      args.push("--repo", repo);
    } else {
      throw new Error("the office project has no repository");
    }
    const url =
      (await run(args, cwd)).split("\n").findLast((line) => line.startsWith("https://")) ?? "";
    return url === "" ? artifacts : { ...artifacts, prUrl: url };
  } catch (error) {
    log.warn(
      { taskId: task.id, err: error instanceof Error ? error.message : String(error) },
      "delivery step failed; branch is still in the source repository",
    );
    return artifacts;
  }
}
