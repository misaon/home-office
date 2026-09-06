import type { EventStore, SandboxProvider, SecretStore } from "@ho/core";
import type { UsageSummary } from "@ho/protocol";
import type { DaemonConfig } from "../config.ts";
import { ensureImages, type ImageStatus, imageStatus, neededVariants } from "../images.ts";
import type { Resources } from "../paths.ts";
import { usageSummary } from "../usage.ts";
import type { HandoffGate } from "../handoff-gate.ts";
import type { IntakeService } from "../intake.ts";
import type { Office } from "../office.ts";
import type { SessionManager } from "../sessions.ts";

export type RpcContext = {
  office: Office;
  sessions: SessionManager;
  gate: HandoffGate;
  intake: IntakeService;
  provider: SandboxProvider;
  secrets: SecretStore;
  config: DaemonConfig;
  version: string;
  startedAt: string;
  buildImages: (onLine: (line: string) => void) => Promise<void>;
  imageStatus: () => Promise<ImageStatus[]>;
  gc: () => Promise<{ containers: string[]; volumes: string[]; images: string[] }>;
  usage: (sinceHours: number | undefined) => Promise<UsageSummary>;
};

export type RpcContextDeps = Pick<
  RpcContext,
  | "office"
  | "sessions"
  | "gate"
  | "intake"
  | "provider"
  | "secrets"
  | "config"
  | "version"
  | "startedAt"
  | "gc"
> & { resources: Resources; store: EventStore };

/** Binds the image, GC and usage operations the RPC handlers expose to the daemon's own services. */
export const createRpcContext = ({ resources, store, ...deps }: RpcContextDeps): RpcContext => ({
  ...deps,
  buildImages: (onLine) =>
    ensureImages(deps.provider, deps.config, resources, neededVariants(deps.office.model), onLine),
  imageStatus: () => imageStatus(deps.config, resources, neededVariants(deps.office.model)),
  usage: (sinceHours) => usageSummary(deps.office, store, sinceHours),
});
