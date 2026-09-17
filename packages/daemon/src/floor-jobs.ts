import { startBossVoice } from "./boss-voice.ts";
import type { DaemonConfig } from "./config.ts";
import type { Logger } from "./logger.ts";
import { OfficeConfigSync } from "./office-config-watch.ts";
import type { OfficeGate } from "./office-gate.ts";
import type { Office } from "./office.ts";
import { startScheduler } from "./scheduler.ts";
import type { SessionManager } from "./sessions.ts";
import { hireDefaultTeams } from "./staffing.ts";

type Deps = {
  office: Office;
  sessions: SessionManager;
  config: DaemonConfig;
  gate: OfficeGate;
  home: string;
  log: Logger;
};

export async function startFloorJobs(deps: Deps): Promise<{ stop: () => Promise<void> }> {
  const { office, sessions, config, gate, home, log } = deps;
  await hireDefaultTeams(office, log);
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
