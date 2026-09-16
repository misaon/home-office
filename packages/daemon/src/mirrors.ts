import type { Project } from "@ho/protocol";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { mustExec } from "./host-exec.ts";

const GIT_TIMEOUT_MS = 120_000;

const mirrorPath = (home: string, project: Project): string =>
  join(home, "mirrors", `${project.id}.git`);

const git = (args: readonly string[], what: string): Promise<string> =>
  mustExec(["git", ...args], { timeoutMs: GIT_TIMEOUT_MS }, `git ${what}`);

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

export const pushLocalBranch = (path: string, branch: string): Promise<string> =>
  git(
    ["-C", path, "push", "--quiet", "origin", `refs/heads/${branch}:refs/heads/${branch}`],
    "push",
  );
