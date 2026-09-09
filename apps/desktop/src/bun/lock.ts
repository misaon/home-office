import { acquireSingleInstanceLock, type LockRelease } from "@ho/daemon";

export async function acquireLock(path: string): Promise<LockRelease | null> {
  return acquireSingleInstanceLock(`${path}.lock`);
}
