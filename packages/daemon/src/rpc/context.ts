import type { SandboxProvider, SecretStore } from "@ho/core";
import type { RepoInspection, RepoInspectInput, UsageSummary } from "@ho/protocol";
import type { DaemonConfig } from "../config.ts";
import { ensureImages, type ImageStatus, imageStatus, neededVariants } from "../images.ts";
import { buildsImages, type Resources } from "../paths.ts";
import { inspectRepo } from "../repo-inspect.ts";
import { usageSummary } from "../usage.ts";
import type { OfficeGate } from "../office-gate.ts";
import type { IntakeService } from "../intake.ts";
import type { Office } from "../office.ts";
import type { SessionManager } from "../sessions.ts";

export type RpcContext = {
  office: Office;
  sessions: SessionManager;
  gate: OfficeGate;
  intake: IntakeService;
  provider: SandboxProvider;
  secrets: SecretStore;
  config: DaemonConfig;
  version: string;
  startedAt: string;
  buildImages: (onLine: (line: string) => void) => Promise<void>;
  imageStatus: () => Promise<ImageStatus[]>;
  /** Whether this build carries the Docker build contexts at all (a compiled CLI does not). */
  imageContexts: boolean;
  gc: () => Promise<{ containers: string[]; volumes: string[]; images: string[] }>;
  usage: (sinceHours: number | undefined) => Promise<UsageSummary>;
  inspectRepo: (input: RepoInspectInput) => Promise<RepoInspection>;
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
> & { resources: Resources };

/** Binds the image, GC and usage operations the RPC handlers expose to the daemon's own services. */
export const createRpcContext = ({ resources, ...deps }: RpcContextDeps): RpcContext => ({
  ...deps,
  buildImages: (onLine) =>
    ensureImages(deps.provider, deps.config, resources, neededVariants(deps.office.model), onLine),
  imageStatus: () => imageStatus(deps.config, resources, neededVariants(deps.office.model)),
  imageContexts: buildsImages(resources),
  usage: (sinceHours) => Promise.resolve(usageSummary(deps.office, sinceHours)),
  inspectRepo,
});
