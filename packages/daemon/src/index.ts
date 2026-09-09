import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type DaemonConfig, resolveHome } from "./config.ts";
import type { DaemonInfo } from "./daemon-info.ts";
import type { Office } from "./office.ts";
import { launchDaemon } from "./launch.ts";
import { acquireSingleInstanceLock } from "./single-instance.ts";

export { DaemonConfig, loadConfig, resolveHome } from "./config.ts";
export { DaemonInfo, daemonInfoPath, daemonUrl, readDaemonInfo } from "./daemon-info.ts";
export { defaultResourcesRoot, type Resources, resolveResources } from "./paths.ts";
export { Office } from "./office.ts";
export { acquireSingleInstanceLock, type LockRelease } from "./single-instance.ts";

export type DaemonHandle = {
  info: DaemonInfo;
  office: Office;
  config: DaemonConfig;
  stop: () => Promise<void>;
};

export type DaemonOptions = {
  /** State directory (config.json, ho.db, daemon.json, logs/); defaults to `HO_HOME` or `~/.config/home-office`. */
  home?: string;
  overrides?: Partial<DaemonConfig>;
  /** Where image contexts, the UI bundle, sprites and migrations live; defaults to the repository. */
  resourcesRoot?: string;
  /** Log to this file instead of stdout (the desktop app has no visible stdout). */
  logFile?: string;
};

export async function startDaemon(options: DaemonOptions = {}): Promise<DaemonHandle> {
  const home = options.home ?? resolveHome();
  await mkdir(home, { recursive: true, mode: 0o700 });
  // `mkdir` leaves the mode of an existing directory alone; a home from an older build may be readable.
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
