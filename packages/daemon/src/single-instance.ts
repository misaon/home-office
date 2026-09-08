import { errorCode } from "@ho/protocol";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export type LockRelease = () => Promise<void>;

const HOLDER_FILE = "holder.json";
const STALE_MS = 30_000;

const Holder = z.object({ pid: z.int().positive(), at: z.number() });

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
};

const isStale = async (dir: string): Promise<boolean> => {
  const holder = await readFile(join(dir, HOLDER_FILE), "utf8")
    .then((text) => Holder.safeParse(JSON.parse(text)))
    .catch(() => null);
  if (holder?.success === true) {
    return !isAlive(holder.data.pid);
  }
  const age = await stat(dir)
    .then((info) => Date.now() - info.mtimeMs)
    .catch(() => Number.POSITIVE_INFINITY);
  return age > STALE_MS;
};

const claim = async (dir: string): Promise<boolean> => {
  try {
    await mkdir(dir, { mode: 0o700 });
    return true;
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      return false;
    }
    throw error;
  }
};

export async function acquireSingleInstanceLock(dir: string): Promise<LockRelease | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await claim(dir)) {
      await writeFile(
        join(dir, HOLDER_FILE),
        JSON.stringify({ pid: process.pid, at: Date.now() }),
        {
          mode: 0o600,
        },
      );
      return async () => {
        await rm(dir, { recursive: true, force: true });
      };
    }
    if (!(await isStale(dir))) {
      return null;
    }
    await rm(dir, { recursive: true, force: true });
  }
  return null;
}
