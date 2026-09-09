import type { SandboxProvider, SecretStore } from "@ho/core";
import type { RepoInspection, RepoInspectInput, UsageSummary } from "@ho/protocol";
import type { DaemonConfig } from "../config.ts";
import { type DirectoryPicker, osascriptDirectoryPicker } from "../host-dialog.ts";
import { createLayoutStore, type LayoutStoreAdapter } from "../layouts.ts";
import type { Logger } from "../logger.ts";
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
  /** The host's directory dialog: a native panel in the desktop app, osascript for a daemon on its own. */
  pickDirectory: DirectoryPicker;
  /** Offices drawn in the internal editor, as JSON in the repository. */
  layouts: LayoutStoreAdapter;
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
> & {
  resources: Resources;
  log: Logger;
  /** Absent when nothing native is available; the daemon then shows its own dialog. */
  pickDirectory: DirectoryPicker | undefined;
};

/** Binds the image, GC and usage operations the RPC handlers expose to the daemon's own services. */
export const createRpcContext = ({
  resources,
  pickDirectory,
  log,
  ...deps
}: RpcContextDeps): RpcContext => ({
  ...deps,
  pickDirectory: pickDirectory ?? osascriptDirectoryPicker,
  buildImages: (onLine) =>
    ensureImages(deps.provider, deps.config, resources, neededVariants(deps.office.model), onLine),
  imageStatus: () => imageStatus(deps.config, resources, neededVariants(deps.office.model)),
  imageContexts: buildsImages(resources),
  usage: (sinceHours) => Promise.resolve(usageSummary(deps.office, sinceHours)),
  inspectRepo,
  layouts: createLayoutStore(resources.layoutsDir, (file, reason) => {
    log.warn({ file, reason }, "office layout ignored");
  }),
});
