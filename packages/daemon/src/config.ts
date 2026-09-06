import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export const DaemonConfig = z.object({
  host: z.string().min(1).default("127.0.0.1"),
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
      platform: z.string().min(1).default("linux/arm64"),
      network: z.string().min(1).default("ho-agents"),
      agentImage: z.string().min(1).default("ho/agent:dev"),
      bridgeImage: z.string().min(1).default("ho/git-bridge:dev"),
      /** How sandboxes reach the daemon; Docker Desktop resolves this to the host loopback. */
      gatewayHost: z.string().min(1).default("host.docker.internal"),
    })
    .prefault({}),
  secrets: z
    .object({
      /** `auto` picks the Keychain on macOS and a 0600 file elsewhere. */
      store: z.enum(["auto", "keychain", "file"]).default("auto"),
    })
    .prefault({}),
  limits: z
    .object({
      memoryMb: z.int().positive().default(2048),
      cpus: z.number().positive().default(2),
      pids: z.int().positive().default(512),
    })
    .prefault({}),
});
export type DaemonConfig = z.infer<typeof DaemonConfig>;

/** All daemon state lives under one directory: config.json, ho.db, daemon.json, logs/. */
export const resolveHome = (env: Record<string, string | undefined> = Bun.env): string =>
  env["HO_HOME"] ?? join(homedir(), ".config", "home-office");

export async function loadConfig(home: string): Promise<DaemonConfig> {
  const file = Bun.file(join(home, "config.json"));
  const raw: unknown = (await file.exists()) ? await file.json() : {};
  return DaemonConfig.parse(raw);
}
