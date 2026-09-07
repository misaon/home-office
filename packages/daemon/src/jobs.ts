import type { SandboxProvider } from "@ho/core";
import { createGithubIssuesConnector } from "@ho/intake-github";
import type { DaemonConfig } from "./config.ts";
import { startGc } from "./gc.ts";
import type { OfficeGate } from "./office-gate.ts";
import { IntakeService } from "./intake.ts";
import type { Logger } from "./logger.ts";
import type { Office } from "./office.ts";
import { startScheduler } from "./scheduler.ts";
import type { SessionManager } from "./sessions.ts";

export type Jobs = {
  intake: IntakeService;
  gcOnce: () => Promise<{ containers: string[]; volumes: string[]; images: string[] }>;
  stop: () => void;
};

/** The daemon's background loops: sandbox garbage collection, the session scheduler and mail intake. */
export function startJobs(deps: {
  office: Office;
  sessions: SessionManager;
  provider: SandboxProvider;
  config: DaemonConfig;
  gate: OfficeGate;
  log: Logger;
}): Jobs {
  const { office, sessions, provider, config, gate, log } = deps;
  const gc = startGc(provider, config, log);
  const scheduler = startScheduler(office, sessions, config, gate, log);
  const intake = new IntakeService(office, [createGithubIssuesConnector()], log);
  intake.start();
  return {
    intake,
    gcOnce: () => gc.runOnce(),
    stop: () => {
      scheduler.stop();
      intake.stop();
      gc.stop();
    },
  };
}
