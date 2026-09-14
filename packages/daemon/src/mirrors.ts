import type { Project } from "@ho/protocol";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { mustExec } from "./host-exec.ts";

const GIT_TIMEOUT_MS = 120_000;

/**
 * Projects defined by a git URL are mirrored on the host with the owner's own git credentials.
 * Sandboxes and bridges only ever see the mirror, so no remote credential enters a container.
 */
const mirrorPath = (home: string, project: Project): string =>
  join(home, "mirrors", `${project.id}.git`);

const git = (args: readonly string[], what: string): Promise<string> =>
  mustExec(["git", ...args], { timeoutMs: GIT_TIMEOUT_MS }, `git ${what}`);

/**
 * The remote as git should see it: a credential embedded in the URL would otherwise sit in the process
 * table and in git's own error output. The host's credential helper answers for the bare URL instead.
 */
const remoteUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return url;
  }
};

/** One refresh at a time per mirror: the lock the office's command chain does not cover, being I/O on a path. */
const pending = new Map<string, Promise<unknown>>();

const serialize = <T>(key: string, work: () => Promise<T>): Promise<T> => {
  const queued = (pending.get(key) ?? Promise.resolve()).then(work, work);
  const settled = queued
    .catch(() => undefined)
    .finally(() => {
      if (pending.get(key) === settled) {
        pending.delete(key);
      }
    });
  pending.set(key, settled);
  return queued;
};

/** Returns the host path the git-bridge should mount as `/src`, refreshing URL mirrors first. */
export async function sourcePathFor(home: string, project: Project): Promise<string> {
  if (project.repo.kind === "local") {
    return project.repo.path;
  }
  const { url } = project.repo;
  const path = mirrorPath(home, project);
  await mkdir(join(home, "mirrors"), { recursive: true, mode: 0o700 });
  return serialize(path, async () => {
    if (await Bun.file(join(path, "HEAD")).exists()) {
      await git(
        [
          "-C",
          path,
          "fetch",
          "--quiet",
          "origin",
          `refs/heads/${project.defaultBranch}:refs/heads/${project.defaultBranch}`,
        ],
        "fetch",
      );
    } else {
      await git(["clone", "--bare", "--quiet", "--", remoteUrl(url), path], "clone");
    }
    return path;
  });
}

/**
 * After the bridge pushed a branch into the mirror, forward it to the real remote with host credentials.
 * A mirror remote refuses explicit refspecs, so mirror semantics are disabled for this one push and only
 * the task branch moves (never the whole ref namespace).
 */
export const pushMirrorBranch = (home: string, project: Project, branch: string): Promise<string> =>
  git(
    [
      "-C",
      mirrorPath(home, project),
      "-c",
      "remote.origin.mirror=false",
      "push",
      "--quiet",
      "origin",
      `refs/heads/${branch}:refs/heads/${branch}`,
    ],
    "push",
  );

/** Pushes a branch of a local project to its `origin` so a pull request can reference it. */
export const pushLocalBranch = (path: string, branch: string): Promise<string> =>
  git(
    ["-C", path, "push", "--quiet", "origin", `refs/heads/${branch}:refs/heads/${branch}`],
    "push",
  );
