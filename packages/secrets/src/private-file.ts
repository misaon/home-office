import { rename, rm, writeFile } from "node:fs/promises";

export async function writePrivateFile(path: string, contents: string): Promise<void> {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
