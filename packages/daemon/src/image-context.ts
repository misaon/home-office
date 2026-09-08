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

const filesIn = (root: string, pattern: string): string[] => [
  ...new Glob(pattern).scanSync({ cwd: root, onlyFiles: true, dot: true }),
];

export async function contextHash(
  resources: Resources,
  name: "agent" | "git-bridge",
): Promise<string> {
  const context = resources.imageContext(name);
  const paths = filesIn(
    context,
    "{Dockerfile,.dockerignore,rtk-config.toml,mcp/package*.json,providers/*/package*.json,bin/ho-runner,plugins/**/*}",
  ).filter((path) => {
    if (path === "Dockerfile" || path === ".dockerignore") {
      return true;
    }
    if (name === "git-bridge") {
      return false;
    }
    return (
      path === "rtk-config.toml" ||
      /^mcp\/package(?:-lock)?\.json$/u.test(path) ||
      /^providers\/[^/]+\/package(?:-lock)?\.json$/u.test(path) ||
      (resources.runnerEntry === null && path === "bin/ho-runner") ||
      (resources.pluginsSource === null && path.startsWith("plugins/"))
    );
  });
  const hashes = [await hashFiles(context, paths)];
  if (name === "agent") {
    if (resources.pluginsSource !== null) {
      hashes.push(
        await hashFiles(resources.pluginsSource, filesIn(resources.pluginsSource, "**/*")),
      );
    }
    if (resources.runnerEntry !== null) {
      hashes.push(
        await hashFiles(resources.root, [
          ...filesIn(resources.root, "packages/{runner,protocol}/src/**/*.ts"),
          "bun.lock",
          "package.json",
        ]),
        Bun.version,
      );
    }
  }
  return new CryptoHasher("sha256").update(hashes.join("\0")).digest("hex").slice(0, 32);
}
