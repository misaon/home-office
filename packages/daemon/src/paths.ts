import { existsSync } from "node:fs";
import { resolve } from "node:path";

type ImageName = "agent" | "git-bridge";

/**
 * Files the daemon ships with: image build contexts and the built office UI. In development they are read
 * from the repository; the packaged desktop app points the daemon at its bundled resources, which mirror
 * the repository layout for exactly these paths.
 */
export type Resources = {
  root: string;
  /** Docker build context of an image; null when this build carries no contexts (a compiled CLI). */
  imageContext: (name: ImageName) => string | null;
  /** ho-runner sources, bundled into the agent image context; null when the context ships the bundle. */
  runnerEntry: string | null;
  /** Built office UI (index.html + chunks); null disables serving. */
  uiDir: string | null;
  /** Where the internal editor keeps drawn offices (`<repo>/layouts`); null outside a source checkout. */
  layoutsDir: string | null;
};

/** Repository root in development; `HO_REPO_ROOT` overrides it (used by the desktop dev loop). */
const defaultResourcesRoot = (): string =>
  Bun.env["HO_REPO_ROOT"] ?? resolve(import.meta.dir, "../../..");

/** Whether this build carries the Docker build contexts of both images. */
export const buildsImages = (resources: Resources): boolean =>
  resources.imageContext("agent") !== null && resources.imageContext("git-bridge") !== null;

const whenPresent = (dir: string, marker: string): string | null =>
  existsSync(resolve(dir, marker)) ? dir : null;

export function resolveResources(root: string = defaultResourcesRoot()): Resources {
  const at = (...parts: string[]): string => resolve(root, ...parts);
  const runnerEntry = at("packages/runner/src/main.ts");
  return {
    root,
    imageContext: (name) => whenPresent(at("images", name), "Dockerfile"),
    runnerEntry: existsSync(runnerEntry) ? runnerEntry : null,
    uiDir: whenPresent(at("packages/ui/dist"), "index.html"),
    layoutsDir: whenPresent(root, "AGENTS.md") === null ? null : at("layouts"),
  };
}
