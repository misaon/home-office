import { type Cancellation, githubRepoFromUrl } from "@ho/core";
import type { Project } from "@ho/protocol";

export type GhTarget = { args: string[]; cwd: string | undefined };

/** Where `gh` should look: the local checkout's own remote, or `--repo owner/name` for URL projects. */
export function ghTarget(project: Project): GhTarget {
  if (project.repo.kind === "local") {
    return { args: [], cwd: project.repo.path };
  }
  const repo = githubRepoFromUrl(project.repo.url);
  if (repo === null) {
    throw new Error(`intake needs a GitHub URL, got ${project.repo.url}`);
  }
  return { args: ["--repo", repo], cwd: undefined };
}

/** Runs the host's `gh` (already authenticated by the owner); never receives agent-controlled text. */
export async function gh(
  args: readonly string[],
  cwd: string | undefined,
  signal?: Cancellation,
): Promise<string> {
  if (signal?.aborted === true) {
    throw new Error("GitHub operation cancelled");
  }
  const proc = Bun.spawn(["gh", ...args], {
    timeout: 30_000,
    env: { ...Bun.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" },
    stdout: "pipe",
    stderr: "pipe",
    ...(cwd === undefined ? {} : { cwd }),
  });
  const abort = (): void => {
    proc.kill();
  };
  signal?.addEventListener("abort", abort);
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
