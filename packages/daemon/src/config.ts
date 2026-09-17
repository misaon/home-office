import type { SecretStoreKind } from "@ho/secrets";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Resources } from "./paths.ts";

const ROOTLESS_ENGINE_IMAGE =
  "docker:29.8.0-dind-rootless@sha256:19b6d666831cda38537c1fc60c76f32bd0f17c77f46d53b080d98b39e1f7cefb";
const ROOTFUL_ENGINE_IMAGE =
  "docker:29.8.0-dind@sha256:c9da39e30475d7bf353436738239d02fb1c2a52a1c968322beccb6ec239707d8";

export const LogLevel = z.enum(["trace", "debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof LogLevel>;

export const DaemonConfig = z.object({
  host: z.enum(["127.0.0.1", "::1", "localhost"]).default("127.0.0.1"),
  port: z.int().min(0).max(65_535).default(47_800),
  logLevel: LogLevel.default("info"),
  scheduler: z
    .object({
      maxConcurrentSessions: z.int().positive().default(2),
    })
    .prefault({}),
  retention: z
    .object({
      taskVolumeHours: z.int().positive().default(24),
    })
    .prefault({}),
  docker: z
    .object({
      socket: z.string().min(1).default("/var/run/docker.sock"),
      platform: z.literal("linux/arm64").default("linux/arm64"),
      network: z.string().min(1).default("ho-agents"),
      agentImage: z.string().min(1).default("ho/agent:dev"),
      bridgeImage: z.string().min(1).default("ho/git-bridge:dev"),
      gatewayHost: z.string().min(1).default("host.docker.internal"),
    })
    .prefault({}),
  secrets: z
    .object({
      store: z
        .enum(["auto", "os", "file", "keychain"])
        .default("auto")
        .transform((value): SecretStoreKind => (value === "keychain" ? "os" : value)),
    })
    .prefault({}),
  ui: z
    .object({
      dir: z.string().min(1).nullable().default(null),
    })
    .prefault({}),
  browser: z
    .object({
      enabled: z.boolean().default(true),
      devtools: z.boolean().default(false),
    })
    .prefault({}),
  services: z
    .object({
      enabled: z.boolean().default(true),
      image: z.string().min(1).default(ROOTLESS_ENGINE_IMAGE),
      rootfulImage: z.string().min(1).default(ROOTFUL_ENGINE_IMAGE),
      memoryMb: z.int().positive().default(2048),
      cpus: z.number().positive().default(2),
      pids: z.int().positive().default(2048),
      startTimeoutMs: z.int().positive().default(60_000),
    })
    .prefault({}),
  limits: z
    .object({
      memoryMb: z.int().positive().default(3072),
      cpus: z.number().positive().default(2),
      pids: z.int().positive().default(2048),
    })
    .prefault({}),
});
export type DaemonConfig = z.infer<typeof DaemonConfig>;

export const resolveHome = (env: Record<string, string | undefined> = Bun.env): string =>
  env["HO_HOME"] ?? join(homedir(), ".config", "home-office");

export async function loadConfig(
  home: string,
  resources: Resources,
  overrides: Partial<DaemonConfig>,
): Promise<DaemonConfig> {
  const file = Bun.file(join(home, "config.json"));
  const stored = (await file.exists()) ? z.looseObject({}).parse(await file.json()) : {};
  const config = DaemonConfig.parse({ ...stored, ...overrides });
  return {
    ...config,
    ui: {
      dir: config.ui.dir ?? resources.uiDir,
    },
  };
}
