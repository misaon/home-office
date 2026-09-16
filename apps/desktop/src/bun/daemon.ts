import { daemonAnswers, daemonUrl, officeUrl, readDaemonInfo, startDaemon } from "@ho/daemon";
import { nativeDirectoryPicker } from "./pick-directory.ts";

export type DaemonLink = {
  url: string;
  officeUrl: string;
  token: string;
  mode: "embedded" | "attached";
  stop: () => Promise<void>;
};

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
  const handle = await startDaemon({ ...options, pickDirectory: nativeDirectoryPicker });
  return {
    url: `${daemonUrl(handle.info)}/`,
    officeUrl: officeUrl(handle.info),
    token: handle.info.token,
    mode: "embedded",
    stop: handle.stop,
  };
}
