import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Repository root in development; packaged builds override this with bundled resources. */
export const repoRoot = (): string =>
  Bun.env["HO_REPO_ROOT"] ?? resolve(import.meta.dir, "../../..");
export const imageContext = (name: "agent" | "git-bridge"): string =>
  resolve(repoRoot(), "images", name);

/** Built office UI and sprite assets as laid out in the repository (packaged builds set config.ui). */
export const defaultUiDirs = (): { dir: string | null; assetsDir: string | null } => {
  const dir = resolve(repoRoot(), "packages/ui/dist");
  const assetsDir = resolve(repoRoot(), "assets");
  return {
    dir: existsSync(`${dir}/index.html`) ? dir : null,
    assetsDir: existsSync(`${assetsDir}/dist/manifest.json`) ? assetsDir : null,
  };
};
