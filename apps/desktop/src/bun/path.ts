import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export function widenPath(): void {
  const home = homedir();
  const candidates = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    join(home, ".docker/bin"),
    join(home, ".bun/bin"),
  ];
  const current = (process.env["PATH"] ?? "").split(delimiter).filter((p) => p !== "");
  const additions = candidates.filter((p) => !current.includes(p) && existsSync(p));
  process.env["PATH"] = [...current, ...additions].join(delimiter);
}
