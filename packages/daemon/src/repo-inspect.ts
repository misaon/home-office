import {
  REPO_BRANCH_LIMIT,
  type RepoInspection,
  type RepoInspectInput,
  type RepoSource,
} from "@ho/protocol";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { exec, type Exec } from "./host-exec.ts";

const GIT_TIMEOUT_MS = 15_000;

const git = (args: readonly string[]): Promise<Exec> =>
  exec(["git", ...args], { timeoutMs: GIT_TIMEOUT_MS });

const nameFromUrl = (url: string): string => {
  const last = url.replace(/\/+$/u, "").split(/[/:]/u).at(-1) ?? "project";
  return last.replace(/\.git$/u, "") || "project";
};

/** The default branch first, then every other name git reported once, without `origin/` or `HEAD`. */
const ordered = (defaultBranch: string, names: readonly string[]): string[] => {
  const cleaned = names
    .map((name) => name.trim().replace(/^origin\//u, ""))
    .filter((name) => name !== "" && name !== "HEAD" && name !== "origin")
    .toSorted((a, b) => a.localeCompare(b));
  return [...new Set([defaultBranch, ...cleaned])].slice(0, REPO_BRANCH_LIMIT);
};

/** `origin/HEAD` when the checkout tracks a remote, else the current branch, else `main`. */
async function localDefaultBranch(path: string): Promise<string> {
  const remote = await git(["-C", path, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (remote.code === 0 && remote.stdout !== "") {
    return remote.stdout.replace(/^origin\//u, "");
  }
  const head = await git(["-C", path, "symbolic-ref", "--short", "HEAD"]);
  return head.code === 0 && head.stdout !== "" ? head.stdout : "main";
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
  if (top.code !== 0 || top.stdout === "") {
    return {
      ok: false,
      message: `${path} is not inside a git repository (${top.stderr || "git failed"})`,
    };
  }
  const repo: RepoSource = { kind: "local", path: top.stdout };
  const defaultBranch = await localDefaultBranch(top.stdout);
  const refs = await git([
    "-C",
    top.stdout,
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
    "refs/remotes/origin",
  ]);
  return {
    ok: true,
    name: basename(top.stdout),
    defaultBranch,
    branches: ordered(defaultBranch, refs.code === 0 ? refs.stdout.split("\n") : []),
    repo,
  };
}

/** One `ls-remote` reports both the symbolic HEAD and every head, so the branch list costs no extra round trip. */
async function inspectRemote(url: string): Promise<RepoInspection> {
  const probe = await git(["ls-remote", "--symref", url, "HEAD", "refs/heads/*"]);
  if (probe.code !== 0) {
    return {
      ok: false,
      message: `cannot reach ${url} (${probe.stderr || "git ls-remote failed"})`,
    };
  }
  const match = /^ref: refs\/heads\/(\S+)\tHEAD$/mu.exec(probe.stdout);
  const defaultBranch = match?.[1] ?? "main";
  const heads = [...probe.stdout.matchAll(/^\S+\trefs\/heads\/(.+)$/gmu)].map(
    ([, name]) => name ?? "",
  );
  return {
    ok: true,
    name: nameFromUrl(url),
    defaultBranch,
    branches: ordered(defaultBranch, heads),
    repo: { kind: "git", url },
  };
}

/** What a repository would be as a floor: whether git knows it, its name and default branch. Never throws. */
export const inspectRepo = (input: RepoInspectInput): Promise<RepoInspection> =>
  input.repo.kind === "local" ? inspectLocal(input.repo.path) : inspectRemote(input.repo.url);
