import {
  errorMessage,
  REPO_BRANCH_LIMIT,
  type RepoInspection,
  type RepoInspectInput,
  type RepoSource,
} from "@ho/protocol";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { exec, type Exec, redactCredentials } from "./host-exec.ts";
import { daemonLog } from "./logger.ts";

const GIT_TIMEOUT_MS = 15_000;
const STDERR_LOG_CHARS = 300;

const git = async (argv: readonly string[], cwd?: string): Promise<Exec> => {
  try {
    return await exec(["git", ...argv], { cwd, timeoutMs: GIT_TIMEOUT_MS });
  } catch (error) {
    return { code: -1, stdout: "", stderr: errorMessage(error) };
  }
};

const tried = async (
  what: string,
  argv: readonly string[],
  cwd?: string,
): Promise<string | null> => {
  const result = await git(argv, cwd);
  if (result.code !== 0) {
    daemonLog()?.debug(
      { git: what, err: result.stderr.slice(0, STDERR_LOG_CHARS) },
      "repo inspect",
    );
    return null;
  }
  daemonLog()?.debug({ git: what, ok: true }, "repo inspect");
  return result.stdout;
};

const nameFromUrl = (url: string): string => {
  const last = url.replace(/\/+$/u, "").split(/[/:]/u).at(-1) ?? "project";
  return last.replace(/\.git$/u, "") || "project";
};

const ordered = (defaultBranch: string, names: readonly string[]): string[] => {
  const cleaned = names
    .map((name) => name.trim().replace(/^origin\//u, ""))
    .filter((name) => name !== "" && name !== "HEAD" && name !== "origin")
    .toSorted((a, b) => a.localeCompare(b));
  return [...new Set([defaultBranch, ...cleaned])].slice(0, REPO_BRANCH_LIMIT);
};

async function localDefaultBranch(path: string): Promise<string> {
  const remote = await tried(
    "remote",
    ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    path,
  );
  if (remote !== null && remote !== "") {
    return remote.replace(/^origin\//u, "");
  }
  const head = await tried("head", ["symbolic-ref", "--short", "HEAD"], path);
  return head === null || head === "" ? "main" : head;
}

async function inspectLocal(path: string): Promise<RepoInspection> {
  try {
    const found = await stat(path);
    if (!found.isDirectory()) {
      return { ok: false, message: `${path} is not a directory` };
    }
  } catch {
    return { ok: false, message: `${path} does not exist` };
  }
  const found = await git(["rev-parse", "--show-toplevel"], path);
  if (found.code !== 0) {
    return {
      ok: false,
      message: `${path} is not inside a git repository (${found.stderr})`,
    };
  }
  const top = found.stdout;
  if (top === "") {
    return { ok: false, message: `${path} is not inside a git repository (git failed)` };
  }
  const repo: RepoSource = { kind: "local", path: top };
  const defaultBranch = await localDefaultBranch(top);
  const refs = await tried(
    "refs",
    ["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes/origin"],
    top,
  );
  return {
    ok: true,
    name: basename(top),
    defaultBranch,
    branches: ordered(defaultBranch, refs === null ? [] : refs.split("\n")),
    repo,
  };
}

async function inspectRemote(url: string): Promise<RepoInspection> {
  const found = await git(["ls-remote", "--symref", url, "HEAD", "refs/heads/*"]);
  if (found.code !== 0) {
    return { ok: false, message: `cannot reach ${redactCredentials(url)} (${found.stderr})` };
  }
  const probe = found.stdout;
  const head = /^ref: refs\/heads\/(?<branch>\S+)\tHEAD$/mu.exec(probe)?.groups;
  const defaultBranch = head?.["branch"] ?? "main";
  const heads = [...probe.matchAll(/^\S+\trefs\/heads\/(?<branch>.+)$/gmu)].map(
    (line) => line.groups?.["branch"] ?? "",
  );
  return {
    ok: true,
    name: nameFromUrl(url),
    defaultBranch,
    branches: ordered(defaultBranch, heads),
    repo: { kind: "git", url },
  };
}

export const inspectRepo = (input: RepoInspectInput): Promise<RepoInspection> =>
  input.repo.kind === "local" ? inspectLocal(input.repo.path) : inspectRemote(input.repo.url);
