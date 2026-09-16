import { writePrivateFile } from "@ho/secrets";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { DaemonConfig } from "./config.ts";

export const DaemonInfo = z.object({
  host: DaemonConfig.shape.host,
  port: z.int().positive(),
  token: z.string().min(16),
  pid: z.int().positive(),
  startedAt: z.iso.datetime(),
  version: z.string(),
  serves: z.object({ ui: z.boolean(), images: z.boolean() }),
});
export type DaemonInfo = z.infer<typeof DaemonInfo>;

const infoPath = (home: string): string => join(home, "daemon.json");

export async function readDaemonInfo(home: string): Promise<DaemonInfo | null> {
  const file = Bun.file(infoPath(home));
  return (await file.exists()) ? DaemonInfo.parse(await file.json()) : null;
}

export async function writeDaemonInfo(home: string, info: DaemonInfo): Promise<void> {
  await writePrivateFile(infoPath(home), `${JSON.stringify(info, null, 2)}\n`);
}

export const removeDaemonInfo = (home: string): Promise<void> =>
  rm(infoPath(home), { force: true });

export const daemonUrl = (
  info: Pick<DaemonInfo, "host" | "port">,
  protocol: "http" | "ws" = "http",
): string =>
  `${protocol}://${info.host.includes(":") ? `[${info.host}]` : info.host}:${String(info.port)}`;

export const officeUrl = (info: DaemonInfo): string => `${daemonUrl(info)}/#token=${info.token}`;

export const daemonAnswers = async (info: DaemonInfo): Promise<boolean> => {
  try {
    const answered = await fetch(`${daemonUrl(info)}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return answered.ok;
  } catch {
    return false;
  }
};
