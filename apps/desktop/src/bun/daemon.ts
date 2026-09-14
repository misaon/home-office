import { daemonAnswers, daemonUrl, officeUrl, readDaemonInfo, startDaemon } from "@ho/daemon";
import { nativeDirectoryPicker } from "./pick-directory.ts";

export type DaemonLink = {
  /** Where the office UI is served. */
  url: string;
  /** The same page with this launch's token in the fragment, for a browser outside the app. */
  officeUrl: string;
  token: string;
  /** `embedded`: this process runs the daemon; `attached`: a `ho daemon` was already running. */
  mode: "embedded" | "attached";
  stop: () => Promise<void>;
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
  if (existing !== null && (await daemonAnswers(existing))) {
    return {
      url: `${daemonUrl(existing)}/`,
      officeUrl: officeUrl(existing),
      token: existing.token,
      mode: "attached",
      stop: () => Promise.resolve(),
    };
  }
  // Only an embedded daemon can show this app's own dialogs; an attached one keeps its own fallback.
  const handle = await startDaemon({ ...options, pickDirectory: nativeDirectoryPicker });
  return {
    url: `${daemonUrl(handle.info)}/`,
    officeUrl: officeUrl(handle.info),
    token: handle.info.token,
    mode: "embedded",
    stop: handle.stop,
  };
}
