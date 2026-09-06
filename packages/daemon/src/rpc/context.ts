import type { SandboxProvider, SecretStore } from "@ho/core";
import type { UsageSummary } from "@ho/protocol";
import type { DaemonConfig } from "../config.ts";
import type { HandoffGate } from "../handoff-gate.ts";
import type { Office } from "../office.ts";
import type { SessionManager } from "../sessions.ts";

export type RpcContext = {
  office: Office;
  sessions: SessionManager;
  gate: HandoffGate;
  provider: SandboxProvider;
  secrets: SecretStore;
  config: DaemonConfig;
  version: string;
  startedAt: string;
  buildImages: (onLine: (line: string) => void) => Promise<void>;
  imageStatus: () => Promise<{ ref: string; present: boolean; upToDate: boolean }[]>;
  gc: () => Promise<{ containers: string[]; volumes: string[]; images: string[] }>;
  usage: (sinceHours: number | undefined) => Promise<UsageSummary>;
};
