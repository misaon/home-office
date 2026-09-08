import { lock } from "proper-lockfile";

export async function acquireLock(path: string): Promise<(() => Promise<void>) | null> {
  try {
    return await lock(path, { realpath: false, stale: 30_000 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ELOCKED") {
      return null;
    }
    throw error;
  }
}
