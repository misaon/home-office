import type { RepoSource } from "./domain.ts";

const SCP_LIKE = /^(?<user>[^\s/@:]+)@(?<host>[^\s/@:]+):(?!\/)(?<path>\S+)$/u;

export const repoUrl = (source: string): string => {
  const trimmed = source.trim();
  const scp = SCP_LIKE.exec(trimmed)?.groups;
  return scp === undefined ? trimmed : `ssh://${scp["user"]}@${scp["host"]}/${scp["path"]}`;
};

export const githubRepoFromUrl = (value: string): string | null => {
  const repo =
    /^(?:https:\/\/github\.com\/|ssh:\/\/(?:git@)?github\.com(?::22)?\/)(?<owner>[a-z0-9-]+)\/(?<name>[a-z0-9_.-]+?)(?:\.git)?\/?$/iu.exec(
      value,
    )?.groups;
  return repo === undefined ? null : `${repo["owner"]}/${repo["name"]}`;
};

export const REPO_URL_FORMS = "https://host/org/repo, ssh://git@host/org/repo or git@host:org/repo";

export const repoSourceOf = (source: string): RepoSource => {
  const url = repoUrl(source);
  return /^[a-z][a-z\d+.-]*:\/\//iu.test(url) ? { kind: "git", url } : { kind: "local", path: url };
};
