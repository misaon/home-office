import type { RepoInspection, RepoInspectInput, RepoSource } from "@ho/protocol";
import { stat } from "node:fs/promises";
import { basename } from "node:path";

const GIT_TIMEOUT_MS = 15_000;

const git = async (args: readonly string[]): Promise<{ ok: boolean; out: string; err: string }> => {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: GIT_TIMEOUT_MS,
    env: { ...Bun.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { ok: code === 0, out: out.trim(), err: err.trim() };
};

const nameFromUrl = (url: string): string => {
  const last = url.replace(/\/+$/u, "").split(/[/:]/u).at(-1) ?? "project";
  return last.replace(/\.git$/u, "") || "project";
};

/** `origin/HEAD` when the checkout tracks a remote, else the current branch, else `main`. */
async function localDefaultBranch(path: string): Promise<string> {
  const remote = await git(["-C", path, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (remote.ok && remote.out !== "") {
    return remote.out.replace(/^origin\//u, "");
  }
  const head = await git(["-C", path, "symbolic-ref", "--short", "HEAD"]);
  return head.ok && head.out !== "" ? head.out : "main";
}

async function inspectLocal(path: string): Promise<RepoInspection> {
  try {
    if (!(await stat(path)).isDirectory()) {
      return { ok: false, message: `${path} is not a directory` };
    }
  } catch {
    return { ok: false, message: `${path} does not exist` };
  }
  const top = await git(["-C", path, "rev-parse", "--show-toplevel"]);
  if (!top.ok || top.out === "") {
    return {
      ok: false,
      message: `${path} is not inside a git repository (${top.err || "git failed"})`,
    };
  }
  const repo: RepoSource = { kind: "local", path: top.out };
  return {
    ok: true,
    name: basename(top.out),
    defaultBranch: await localDefaultBranch(top.out),
    repo,
  };
}

async function inspectRemote(url: string): Promise<RepoInspection> {
  const probe = await git(["ls-remote", "--symref", url, "HEAD"]);
  if (!probe.ok) {
    return { ok: false, message: `cannot reach ${url} (${probe.err || "git ls-remote failed"})` };
  }
  const match = /^ref: refs\/heads\/(\S+)\tHEAD$/mu.exec(probe.out);
  return {
    ok: true,
    name: nameFromUrl(url),
    defaultBranch: match?.[1] ?? "main",
    repo: { kind: "git", url },
  };
}

/** What a repository would be as a floor: whether git knows it, its name and default branch. Never throws. */
export const inspectRepo = (input: RepoInspectInput): Promise<RepoInspection> =>
  input.repo.kind === "local" ? inspectLocal(input.repo.path) : inspectRemote(input.repo.url);
