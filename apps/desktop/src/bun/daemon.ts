import { daemonUrl, type DaemonInfo, readDaemonInfo, startDaemon } from "@ho/daemon";
import { nativeDirectoryPicker } from "./pick-directory.ts";

export type DaemonLink = {
  /** Where the office UI is served. */
  url: string;
  token: string;
  /** `embedded`: this process runs the daemon; `attached`: a `ho daemon` was already running. */
  mode: "embedded" | "attached";
  stop: () => Promise<void>;
};

const healthy = async (info: DaemonInfo): Promise<boolean> => {
  try {
    const res = await fetch(`${daemonUrl(info)}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
};

/**
 * Reuses a running daemon (the developer loop keeps `ho daemon` in a terminal) or starts one in this
 * process. A stale daemon.json from a crashed process is simply overwritten by the new daemon.
 */
export async function attachOrStart(options: {
  home: string;
  resourcesRoot: string;
  logFile: string;
}): Promise<DaemonLink> {
  const existing = await readDaemonInfo(options.home);
  if (existing !== null && (await healthy(existing))) {
    return {
      url: `${daemonUrl(existing)}/`,
      token: existing.token,
      mode: "attached",
      stop: () => Promise.resolve(),
    };
  }
  // Only an embedded daemon can show this app's own dialogs; an attached one keeps its own fallback.
  const handle = await startDaemon({ ...options, pickDirectory: nativeDirectoryPicker });
  return {
    url: `${daemonUrl(handle.info)}/`,
    token: handle.info.token,
    mode: "embedded",
    stop: handle.stop,
  };
}
