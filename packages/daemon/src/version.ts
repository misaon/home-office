const release = Bun.env["HO_RELEASE_VERSION"];

const commitOf = (): string | null => {
  const proc = Bun.spawnSync(["git", "-C", import.meta.dir, "rev-parse", "--short", "HEAD"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const sha = proc.exitCode === 0 ? proc.stdout.toString().trim() : "";
  return sha === "" ? null : sha;
};

export const VERSION = release ?? `0.0.0-dev+${commitOf() ?? "unknown"}`;
