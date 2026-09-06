/** `owner/name` for GitHub URLs (https or ssh); null for anything else. */
export const githubRepoFromUrl = (url: string): string | null => {
  const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(url);
  return match === null ? null : `${match[1] ?? ""}/${match[2] ?? ""}`;
};
