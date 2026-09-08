import { rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { DaemonConfig } from "./config.ts";
import { writePrivateFile } from "@ho/secrets";

/** Written next to the database so local clients (CLI, desktop shell) can find and authenticate to the daemon. */
export const DaemonInfo = z.object({
  host: DaemonConfig.shape.host,
  port: z.int().positive(),
  token: z.string().min(16),
  pid: z.int().positive(),
  startedAt: z.iso.datetime(),
  version: z.string(),
  /** What this build carries; absent in files written by an older daemon. */
  serves: z.object({ ui: z.boolean(), images: z.boolean() }).optional(),
});
export type DaemonInfo = z.infer<typeof DaemonInfo>;

export const daemonInfoPath = (home: string): string => join(home, "daemon.json");

export async function readDaemonInfo(home: string): Promise<DaemonInfo | null> {
  const file = Bun.file(daemonInfoPath(home));
  return (await file.exists()) ? DaemonInfo.parse(await file.json()) : null;
}

/** The file carries the bearer token, so it is readable by the owner only. */
export async function writeDaemonInfo(home: string, info: DaemonInfo): Promise<void> {
  await writePrivateFile(daemonInfoPath(home), `${JSON.stringify(info, null, 2)}\n`);
}

export const removeDaemonInfo = (home: string): Promise<void> =>
  rm(daemonInfoPath(home), { force: true });

export const daemonUrl = (
  info: Pick<DaemonInfo, "host" | "port">,
  protocol: "http" | "ws" = "http",
): string =>
  `${protocol}://${info.host.includes(":") ? `[${info.host}]` : info.host}:${String(info.port)}`;
