import { resolve } from "node:path";

/** Repository root in development; packaged builds override this with bundled resources. */
export const repoRoot = (): string =>
  Bun.env["HO_REPO_ROOT"] ?? resolve(import.meta.dir, "../../..");
export const imageContext = (name: "agent" | "git-bridge"): string =>
  resolve(repoRoot(), "images", name);
