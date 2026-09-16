import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type DaemonHandle, type DaemonOptions, launchDaemon } from "./launch.ts";
import { resolveHome } from "./config.ts";
import { acquireSingleInstanceLock } from "./single-instance.ts";

export { DaemonConfig, LogLevel, resolveHome } from "./config.ts";
export { DaemonInfo, daemonAnswers, daemonUrl, officeUrl, readDaemonInfo } from "./daemon-info.ts";
export type { DirectoryPicker } from "./host-dialog.ts";
export type { DaemonHandle, DaemonOptions } from "./launch.ts";

export async function startDaemon(options: DaemonOptions = {}): Promise<DaemonHandle> {
  const home = options.home ?? resolveHome();
  await mkdir(home, { recursive: true, mode: 0o700 });
  await chmod(home, 0o700).catch(() => undefined);
  const release = await acquireSingleInstanceLock(join(home, "daemon.lock"));
  if (release === null) {
    throw new Error(`another daemon already holds ${home}`);
  }
  const cleanup = new AsyncDisposableStack();
  cleanup.defer(release);
  try {
    return await launchDaemon(options, home, cleanup);
  } catch (error) {
    await cleanup.disposeAsync();
    throw error;
  }
}
