import { existsSync } from "node:fs";
import { resolve } from "node:path";

type ImageName = "agent" | "git-bridge";

export type Resources = {
  root: string;
  imageContext: (name: ImageName) => string | null;
  runnerEntry: string | null;
  uiDir: string | null;
  layoutsDir: string | null;
  pluginsDir: string | null;
};

const defaultResourcesRoot = (): string =>
  Bun.env["HO_REPO_ROOT"] ?? resolve(import.meta.dir, "../../..");

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
    pluginsDir: whenPresent(at("images/agent/plugins"), "boss"),
    layoutsDir: whenPresent(root, "AGENTS.md") === null ? null : at("layouts"),
  };
}
