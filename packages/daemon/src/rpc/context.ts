import type { SandboxProvider, SecretStore } from "@ho/core";
import type { DaemonConfig } from "../config.ts";
import type { Office } from "../office.ts";
import type { SessionManager } from "../sessions.ts";

export type RpcContext = {
  office: Office;
  sessions: SessionManager;
  provider: SandboxProvider;
  secrets: SecretStore;
  config: DaemonConfig;
  version: string;
  startedAt: string;
  buildImages: (onLine: (line: string) => void) => Promise<void>;
  imageStatus: () => Promise<{ ref: string; present: boolean; upToDate: boolean }[]>;
};
