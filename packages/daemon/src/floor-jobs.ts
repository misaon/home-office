import type { SandboxProvider } from "@ho/core";
import type { PlanUsageStatus } from "@ho/protocol";
import { startBossVoice } from "./boss-voice.ts";
import type { DaemonConfig } from "./config.ts";
import type { Logger } from "./logger.ts";
import { MandateSteward } from "./mandate-steward.ts";
import { OfficeConfigSync } from "./office-config-watch.ts";
import type { OfficeGate } from "./office-gate.ts";
import type { Office } from "./office.ts";
import { PlanUsageMeter } from "./plan-usage.ts";
import { startScheduler } from "./scheduler.ts";
import type { SessionManager } from "./sessions.ts";
import { hireDefaultTeams } from "./staffing.ts";

type Deps = {
  office: Office;
  sessions: SessionManager;
  provider: SandboxProvider;
  config: DaemonConfig;
  gate: OfficeGate;
  home: string;
  log: Logger;
};

export type FloorJobs = { stop: () => Promise<void>; planUsage: () => PlanUsageStatus };

export async function startFloorJobs(deps: Deps): Promise<FloorJobs> {
  const { office, sessions, provider, config, gate, home, log } = deps;
  await hireDefaultTeams(office, log);
  const voice = startBossVoice(office, gate, log);
  const scheduler = startScheduler(office, sessions, config, gate, log);
  const steward = new MandateSteward({ office, provider, config, home, log });
  steward.start();
  const officeFiles = new OfficeConfigSync(office, home, log);
  officeFiles.start();
  const plan = new PlanUsageMeter(office, log, config.plan.enabled);
  plan.start();
  return {
    planUsage: () => plan.status(),
    stop: async () => {
      await plan.stop();
      await officeFiles.stop();
      await steward.stop();
      await scheduler.stop();
      await voice.stop();
    },
  };
}
