import type { SecretStoreKind } from "@ho/secrets";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Resources } from "./paths.ts";

/** Pinned by the linux/arm64 manifest digest, verified with `docker manifest inspect` on 2026-09-09. */
const ROOTLESS_ENGINE_IMAGE =
  "docker:29.8.0-dind-rootless@sha256:19b6d666831cda38537c1fc60c76f32bd0f17c77f46d53b080d98b39e1f7cefb";
const ROOTFUL_ENGINE_IMAGE =
  "docker:29.8.0-dind@sha256:c9da39e30475d7bf353436738239d02fb1c2a52a1c968322beccb6ec239707d8";

export const DaemonConfig = z.object({
  host: z.enum(["127.0.0.1", "::1", "localhost"]).default("127.0.0.1"),
  port: z.int().min(0).max(65535).default(47800),
  logLevel: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  scheduler: z
    .object({
      maxConcurrentSessions: z.int().positive().default(2),
    })
    .prefault({}),
  retention: z
    .object({
      taskVolumeHours: z.int().positive().default(24),
      idleStopMinutes: z.int().positive().default(10),
    })
    .prefault({}),
  docker: z
    .object({
      socket: z.string().min(1).default("/var/run/docker.sock"),
      platform: z.literal("linux/arm64").default("linux/arm64"),
      network: z.string().min(1).default("ho-agents"),
      agentImage: z.string().min(1).default("ho/agent:dev"),
      bridgeImage: z.string().min(1).default("ho/git-bridge:dev"),
      /** How sandboxes reach the daemon; Docker Desktop resolves this to the host loopback. */
      gatewayHost: z.string().min(1).default("host.docker.internal"),
    })
    .prefault({}),
  secrets: z
    .object({
      /** `auto` uses the OS credential store and falls back to a 0600 file where the host has none. */
      store: z
        .enum(["auto", "os", "file", "keychain"])
        .default("auto")
        .transform((value): SecretStoreKind => (value === "keychain" ? "os" : value)),
    })
    .prefault({}),
  ui: z
    .object({
      /** Directory with the built office UI (index.html + chunks); null means the bundled default. */
      dir: z.string().min(1).nullable().default(null),
    })
    .prefault({}),
  /** Headless Chromium + Playwright/Chrome DevTools MCP inside work and review sessions (D15). */
  browser: z
    .object({
      enabled: z.boolean().default(true),
      devtools: z.boolean().default(false),
    })
    .prefault({}),
  /**
   * The private container engine a task gets when its project asks for one. Images are pinned by the
   * arm64 manifest digest, the only architecture the sandboxes support. Measured: the engine needs more
   * than 768 MB to start at all, and its limit caps every service it runs, because nested containers
   * share its cgroup.
   */
  services: z
    .object({
      /** Off here disables the feature for every project, whatever the project's own policy says. */
      enabled: z.boolean().default(true),
      image: z.string().min(1).default(ROOTLESS_ENGINE_IMAGE),
      rootfulImage: z.string().min(1).default(ROOTFUL_ENGINE_IMAGE),
      memoryMb: z.int().positive().default(2048),
      cpus: z.number().positive().default(2),
      pids: z.int().positive().default(2048),
      /** Readiness after the container starts; measured at 1–2 s. The first image pull has its own budget. */
      startTimeoutMs: z.int().positive().default(60_000),
    })
    .prefault({}),
  /** Chromium needs headroom: several processes and hundreds of threads count against the pids limit. */
  limits: z
    .object({
      memoryMb: z.int().positive().default(3072),
      cpus: z.number().positive().default(2),
      pids: z.int().positive().default(2048),
    })
    .prefault({}),
});
export type DaemonConfig = z.infer<typeof DaemonConfig>;

/** All daemon state lives under one directory: config.json, ho.db, daemon.json, logs/. */
export const resolveHome = (env: Record<string, string | undefined> = Bun.env): string =>
  env["HO_HOME"] ?? join(homedir(), ".config", "home-office");

export async function loadConfig(home: string, resources: Resources): Promise<DaemonConfig> {
  const file = Bun.file(join(home, "config.json"));
  const raw: unknown = (await file.exists()) ? await file.json() : {};
  const config = DaemonConfig.parse(raw);
  return {
    ...config,
    ui: {
      dir: config.ui.dir ?? resources.uiDir,
    },
  };
}
