import { startBossVoice } from "./boss-voice.ts";
import type { DaemonConfig } from "./config.ts";
import type { Logger } from "./logger.ts";
import { OfficeConfigSync } from "./office-config-watch.ts";
import type { OfficeGate } from "./office-gate.ts";
import type { Office } from "./office.ts";
import { startScheduler } from "./scheduler.ts";
import type { SessionManager } from "./sessions.ts";

type Deps = {
  office: Office;
  sessions: SessionManager;
  config: DaemonConfig;
  gate: OfficeGate;
  /** The daemon's state directory, which is where mirrors of git floors live. */
  home: string;
  log: Logger;
};

/**
 * The three things that run behind the server once the office is up: the boss saying what happened,
 * the scheduler starting sessions, and every floor being brought into line with its own
 * `.ho/config.json`. They stop in the reverse order, each bounded by its own stop.
 */
export function startFloorJobs(deps: Deps): { stop: () => Promise<void> } {
  const { office, sessions, config, gate, home, log } = deps;
  const voice = startBossVoice(office, gate, log);
  const scheduler = startScheduler(office, sessions, config, gate, log);
  const officeFiles = new OfficeConfigSync(office, home, log);
  officeFiles.start();
  return {
    stop: async () => {
      await officeFiles.stop();
      await scheduler.stop();
      await voice.stop();
    },
  };
}
