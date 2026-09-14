import type { SandboxProvider, SecretStore } from "@ho/core";
import type { AttachmentStore } from "../attachments.ts";
import type { DaemonConfig } from "../config.ts";
import type { DirectoryPicker } from "../host-dialog.ts";
import type { IntakeService } from "../intake.ts";
import type { Logger } from "../logger.ts";
import type { OfficeGate } from "../office-gate.ts";
import type { Office } from "../office.ts";
import type { Resources } from "../paths.ts";
import type { SessionManager } from "../sessions.ts";

/** The daemon's services as the RPC handlers see them; the router calls the modules directly. */
export type RpcContext = {
  office: Office;
  sessions: SessionManager;
  attachments: AttachmentStore;
  gate: OfficeGate;
  intake: IntakeService;
  provider: SandboxProvider;
  secrets: SecretStore;
  config: DaemonConfig;
  resources: Resources;
  version: string;
  startedAt: string;
  gc: () => Promise<{ containers: string[]; volumes: string[]; images: string[] }>;
  /** The host's directory dialog: a native panel in the desktop app, osascript for a daemon on its own. */
  pickDirectory: DirectoryPicker;
  log: Logger;
};
