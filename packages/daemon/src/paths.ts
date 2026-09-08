import { existsSync } from "node:fs";
import { resolve } from "node:path";

type ImageName = "agent" | "git-bridge";

/**
 * Files the daemon ships with: image build contexts, the built office UI, sprites and database
 * migrations. In development they are read from the repository; the packaged desktop app points the
 * daemon at its bundled resources, which mirror the repository layout for exactly these paths.
 */
export type Resources = {
  root: string;
  /** Docker build context of an image; null when this build carries no contexts (a compiled CLI). */
  imageContext: (name: ImageName) => string | null;
  /** ho-runner sources, bundled into the agent image context; null when the context ships the bundle. */
  runnerEntry: string | null;
  /** Role skill packs synced into the agent image context; null when the context already carries them. */
  pluginsSource: string | null;
  /** Built office UI (index.html + chunks); null disables serving. */
  uiDir: string | null;
  /** Sprite sources and manifest (`assets/`); null disables serving. */
  assetsDir: string | null;
  /** Drizzle migrations; null uses the store package's own folder (development). */
  migrationsDir: string | null;
};

/** Repository root in development; `HO_REPO_ROOT` overrides it (used by the desktop dev loop). */
export const defaultResourcesRoot = (): string =>
  Bun.env["HO_REPO_ROOT"] ?? resolve(import.meta.dir, "../../..");

/** Whether this build carries the Docker build contexts of both images. */
export const buildsImages = (resources: Resources): boolean =>
  resources.imageContext("agent") !== null && resources.imageContext("git-bridge") !== null;

const whenPresent = (dir: string, marker: string): string | null =>
  existsSync(resolve(dir, marker)) ? dir : null;

export function resolveResources(root: string = defaultResourcesRoot()): Resources {
  const at = (...parts: string[]): string => resolve(root, ...parts);
  const runnerEntry = at("packages/runner/src/main.ts");
  const pluginsSource = at("packages/agent-kit/plugins");
  return {
    root,
    imageContext: (name) => whenPresent(at("images", name), "Dockerfile"),
    runnerEntry: existsSync(runnerEntry) ? runnerEntry : null,
    pluginsSource: existsSync(pluginsSource) ? pluginsSource : null,
    uiDir: whenPresent(at("packages/ui/dist"), "index.html"),
    assetsDir: whenPresent(at("assets"), "dist/manifest.json"),
    migrationsDir: whenPresent(at("packages/store/drizzle"), "meta/_journal.json"),
  };
}
