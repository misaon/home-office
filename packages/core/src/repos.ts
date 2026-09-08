export const githubRepoFromUrl = (value: string): string | null => {
  const match =
    /^(?:https:\/\/github\.com\/|ssh:\/\/(?:git@)?github\.com(?::22)?\/|git@github\.com:)([a-z0-9-]+)\/([a-z0-9_.-]+?)(?:\.git)?\/?$/iu.exec(
      value,
    );
  return match?.[1] === undefined || match[2] === undefined ? null : `${match[1]}/${match[2]}`;
};
