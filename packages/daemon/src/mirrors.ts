import type { Project } from "@ho/protocol";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { lock } from "proper-lockfile";

/**
 * Projects defined by a git URL are mirrored on the host with the owner's own git credentials.
 * Sandboxes and bridges only ever see the mirror, so no remote credential enters a container.
 */
const mirrorPath = (home: string, project: Project): string =>
  join(home, "mirrors", `${project.id}.git`);

const git = async (args: readonly string[], cwd?: string): Promise<string> => {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
    env: { ...Bun.env, GIT_TERMINAL_PROMPT: "0" },
    ...(cwd === undefined ? {} : { cwd }),
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(
      `git ${args.find((a) => !a.startsWith("-") && a !== "-C") ?? ""} failed (${String(code)}): ${stderr.trim() || stdout.trim()}`,
    );
  }
  return stdout;
};

/** Returns the host path the git-bridge should mount as `/src`, refreshing URL mirrors first. */
export async function sourcePathFor(home: string, project: Project): Promise<string> {
  if (project.repo.kind === "local") {
    return project.repo.path;
  }
  const path = mirrorPath(home, project);
  await mkdir(join(home, "mirrors"), { recursive: true, mode: 0o700 });
  const release = await lock(path, {
    realpath: false,
    stale: 30_000,
    retries: { retries: 20, minTimeout: 250, maxTimeout: 1000 },
  });
  try {
    if (await Bun.file(join(path, "HEAD")).exists()) {
      await git([
        "-C",
        path,
        "fetch",
        "--quiet",
        "origin",
        `refs/heads/${project.defaultBranch}:refs/heads/${project.defaultBranch}`,
      ]);
    } else {
      await git(["clone", "--bare", "--quiet", "--", project.repo.url, path]);
    }
  } finally {
    await release();
  }
  return path;
}

/**
 * After the bridge pushed a branch into the mirror, forward it to the real remote with host credentials.
 * A mirror remote refuses explicit refspecs, so mirror semantics are disabled for this one push and only
 * the task branch moves (never the whole ref namespace).
 */
export async function pushMirrorBranch(
  home: string,
  project: Project,
  branch: string,
): Promise<void> {
  if (project.repo.kind !== "git") {
    return;
  }
  const refspec = `refs/heads/${branch}:refs/heads/${branch}`;
  await git([
    "-C",
    mirrorPath(home, project),
    "-c",
    "remote.origin.mirror=false",
    "push",
    "--quiet",
    "origin",
    refspec,
  ]);
}

/** Pushes a branch of a local project to its `origin` so a pull request can reference it. */
export async function pushLocalBranch(project: Project, branch: string): Promise<void> {
  if (project.repo.kind !== "local") {
    return;
  }
  await git([
    "-C",
    project.repo.path,
    "push",
    "--quiet",
    "origin",
    `refs/heads/${branch}:refs/heads/${branch}`,
  ]);
}
