import { CryptoHasher, Glob } from "bun";
import { join } from "node:path";
import type { Resources } from "./paths.ts";

async function hashFiles(root: string, paths: readonly string[]): Promise<string> {
  const hasher = new CryptoHasher("sha256");
  for (const path of paths.toSorted()) {
    const bytes = new Uint8Array(await Bun.file(join(root, path)).arrayBuffer());
    hasher.update(`${path}\0${String(bytes.length)}\0`);
    hasher.update(bytes);
  }
  return hasher.digest("hex");
}

const filesIn = (root: string, patterns: readonly string[]): string[] =>
  patterns.flatMap((pattern) => [
    ...new Glob(pattern).scanSync({ cwd: root, onlyFiles: true, dot: true }),
  ]);

const contextPatterns = (resources: Resources, name: "agent" | "git-bridge"): string[] => {
  if (name === "git-bridge") {
    return ["Dockerfile", ".dockerignore"];
  }
  return [
    "Dockerfile",
    ".dockerignore",
    "rtk-config.toml",
    "mcp/package.json",
    "mcp/package-lock.json",
    "providers/*/package.json",
    "providers/*/package-lock.json",
    ...(resources.runnerEntry === null ? ["bin/ho-runner"] : []),
    ...(resources.pluginsSource === null ? ["plugins/**/*"] : []),
  ];
};

export async function contextHash(
  resources: Resources,
  name: "agent" | "git-bridge",
): Promise<string> {
  const context = resources.imageContext(name);
  const paths = filesIn(context, contextPatterns(resources, name));
  const hashes = [await hashFiles(context, paths)];
  if (name === "agent") {
    if (resources.pluginsSource !== null) {
      hashes.push(
        await hashFiles(resources.pluginsSource, filesIn(resources.pluginsSource, ["**/*"])),
      );
    }
    if (resources.runnerEntry !== null) {
      hashes.push(
        await hashFiles(resources.root, [
          ...filesIn(resources.root, [
            "packages/runner/src/**/*.ts",
            "packages/protocol/src/**/*.ts",
          ]),
          "bun.lock",
          "package.json",
        ]),
        Bun.version,
      );
    }
  }
  return new CryptoHasher("sha256").update(hashes.join("\0")).digest("hex").slice(0, 32);
}
