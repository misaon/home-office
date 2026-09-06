import { githubRepoFromUrl } from "@ho/core";
import type { Project } from "@ho/protocol";

export type GhTarget = { args: string[]; cwd: string | undefined };

/** Where `gh` should look: the local checkout's own remote, or `--repo owner/name` for URL projects. */
export function ghTarget(project: Project): GhTarget {
  if (project.repo.kind === "local") {
    return { args: [], cwd: project.repo.path };
  }
  if (project.repo.kind === "git") {
    const repo = githubRepoFromUrl(project.repo.url);
    if (repo === null) {
      throw new Error(`intake needs a GitHub URL, got ${project.repo.url}`);
    }
    return { args: ["--repo", repo], cwd: undefined };
  }
  throw new Error("the office project has no repository");
}

/** Runs the host's `gh` (already authenticated by the owner); never receives agent-controlled text. */
export async function gh(
  args: readonly string[],
  cwd: string | undefined,
  signal?: AbortSignal,
): Promise<string> {
  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    ...(cwd === undefined ? {} : { cwd }),
  });
  const abort = (): void => {
    proc.kill();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) {
      throw new Error(
        `gh ${args.slice(0, 2).join(" ")} failed (${String(code)}): ${(stderr.trim() || stdout.trim()).slice(0, 500)}`,
      );
    }
    return stdout;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
