import { rm } from "node:fs/promises";

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Single-instance lock: a pid file in HO_HOME. Returns a release function, or null when another live
 * desktop process holds it. A stale file (dead pid) is taken over.
 */
export async function acquireLock(path: string): Promise<(() => Promise<void>) | null> {
  const file = Bun.file(path);
  if (await file.exists()) {
    const pid = Number((await file.text()).trim());
    if (Number.isInteger(pid) && pid !== process.pid && alive(pid)) {
      return null;
    }
  }
  await Bun.write(path, `${String(process.pid)}\n`);
  return async () => {
    await rm(path, { force: true });
  };
}
