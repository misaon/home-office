import type { RepoSource } from "./domain.ts";

const SCP_LIKE = /^([^\s/@:]+)@([^\s/@:]+):(?!\/)(\S+)$/u;

/** Git's scp-style shorthand — what GitHub's "SSH" button copies — is not a URL; `ssh://` is. */
export const repoUrl = (source: string): string => {
  const trimmed = source.trim();
  const scp = SCP_LIKE.exec(trimmed);
  return scp === null ? trimmed : `ssh://${scp[1]}@${scp[2]}/${scp[3]}`;
};

/** `owner/name` of a GitHub repository URL (HTTPS or ssh://), or null for any other remote. */
export const githubRepoFromUrl = (value: string): string | null => {
  const match =
    /^(?:https:\/\/github\.com\/|ssh:\/\/(?:git@)?github\.com(?::22)?\/)([a-z0-9-]+)\/([a-z0-9_.-]+?)(?:\.git)?\/?$/iu.exec(
      value,
    );
  return match?.[1] === undefined || match[2] === undefined ? null : `${match[1]}/${match[2]}`;
};

export const REPO_URL_FORMS = "https://host/org/repo, ssh://git@host/org/repo or git@host:org/repo";

/** Anything carrying a URL scheme or the scp shorthand is a repository URL; the rest is a local path. */
export const repoSourceOf = (source: string): RepoSource => {
  const url = repoUrl(source);
  return /^[a-z][a-z\d+.-]*:\/\//iu.test(url) ? { kind: "git", url } : { kind: "local", path: url };
};
