import {
  REPO_BRANCH_LIMIT,
  errorMessage,
  type RepoInspection,
  type RepoInspectInput,
  type RepoSource,
} from "@ho/protocol";
import { stat } from "node:fs/promises";
import { daemonLog } from "./logger.ts";
import { basename } from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";

const GIT_TIMEOUT_MS = 15_000;

const gitIn = (baseDir?: string): SimpleGit =>
  simpleGit({
    ...(baseDir === undefined ? {} : { baseDir }),
    timeout: { block: GIT_TIMEOUT_MS },
  });

const tried = async (what: string, run: () => Promise<string>): Promise<string | null> => {
  try {
    const out = await run();
    daemonLog()?.debug({ git: what, ok: true }, "repo inspect");
    return out.trim();
  } catch (error) {
    daemonLog()?.debug({ git: what, err: errorMessage(error).slice(0, 300) }, "repo inspect");
    return null;
  }
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
  const git = gitIn(path);
  const remote = await tried("remote", () =>
    git.raw(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]),
  );
  if (remote !== null && remote !== "") {
    return remote.replace(/^origin\//u, "");
  }
  const head = await tried("head", () => git.raw(["symbolic-ref", "--short", "HEAD"]));
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
  let top: string;
  try {
    const found = await gitIn(path).revparse(["--show-toplevel"]);
    top = found.trim();
  } catch (error) {
    return {
      ok: false,
      message: `${path} is not inside a git repository (${errorMessage(error)})`,
    };
  }
  if (top === "") {
    return { ok: false, message: `${path} is not inside a git repository (git failed)` };
  }
  const repo: RepoSource = { kind: "local", path: top };
  const defaultBranch = await localDefaultBranch(top);
  const refs = await tried("refs", () =>
    gitIn(top).raw([
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads",
      "refs/remotes/origin",
    ]),
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
  let probe: string;
  try {
    probe = await gitIn().listRemote(["--symref", url, "HEAD", "refs/heads/*"]);
  } catch (error) {
    return { ok: false, message: `cannot reach ${url} (${errorMessage(error)})` };
  }
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
