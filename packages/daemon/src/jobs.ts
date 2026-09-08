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
  start: () => void;
  stop: () => Promise<void>;
};

/** The daemon's background loops: sandbox garbage collection, the session scheduler and mail intake. */
export function createJobs(deps: {
  office: Office;
  sessions: SessionManager;
  provider: SandboxProvider;
  config: DaemonConfig;
  gate: OfficeGate;
  log: Logger;
}): Jobs {
  const { office, sessions, provider, config, gate, log } = deps;
  let gc: ReturnType<typeof startGc> | null = null;
  let scheduler: ReturnType<typeof startScheduler> | null = null;
  const intake = new IntakeService(office, [createGithubIssuesConnector()], log);
  return {
    intake,
    gcOnce: () => {
      if (gc === null) {
        return Promise.reject(new Error("jobs have not started"));
      }
      return gc.runOnce();
    },
    start: () => {
      gc ??= startGc(provider, config, log);
      scheduler ??= startScheduler(office, sessions, config, gate, log);
      intake.start();
    },
    stop: async () => {
      await Promise.all([scheduler?.stop(), intake.stop(), gc?.stop()]);
    },
  };
}
