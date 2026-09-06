import { createSecretStore } from "@ho/secrets";
import { createSqliteEventStore, openDatabase } from "@ho/store";
import { createIdFactory } from "@ho/core";
import { chmod, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type DaemonConfig, loadConfig, resolveHome } from "./config.ts";
import { createLogger } from "./logger.ts";
import { Office } from "./office.ts";
import { startServer } from "./server.ts";

export { DaemonConfig, loadConfig, resolveHome } from "./config.ts";
export { Office } from "./office.ts";

const VERSION = "0.0.0-dev";

/** Written next to the database so local clients (CLI, webview) can find and authenticate to the daemon. */
export const DaemonInfo = z.object({
  host: z.string(),
  port: z.int().positive(),
  token: z.string().min(16),
  pid: z.int().positive(),
  startedAt: z.iso.datetime(),
  version: z.string(),
});
export type DaemonInfo = z.infer<typeof DaemonInfo>;

export const daemonInfoPath = (home: string): string => join(home, "daemon.json");

export async function readDaemonInfo(home: string): Promise<DaemonInfo | null> {
  const file = Bun.file(daemonInfoPath(home));
  return (await file.exists()) ? DaemonInfo.parse(await file.json()) : null;
}

export type DaemonHandle = {
  info: DaemonInfo;
  office: Office;
  config: DaemonConfig;
  stop: () => Promise<void>;
};

export async function startDaemon(
  options: { home?: string; overrides?: Partial<DaemonConfig> } = {},
): Promise<DaemonHandle> {
  const home = options.home ?? resolveHome();
  await mkdir(home, { recursive: true, mode: 0o700 });
  const config: DaemonConfig = { ...(await loadConfig(home)), ...options.overrides };
  const log = createLogger(config.logLevel);
  const clock = { now: () => new Date() };
  const ids = createIdFactory(clock, {
    randomize: (bytes) => {
      crypto.getRandomValues(bytes);
    },
  });

  const database = openDatabase(join(home, "ho.db"));
  const store = createSqliteEventStore(database.db, { ids, clock });
  const office = await Office.open(store, clock, log);
  const secrets = createSecretStore(home);
  log.debug(
    { secretStore: process.platform === "darwin" ? "keychain" : "file" },
    "secret store ready",
  );
  void secrets;

  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const startedAt = clock.now().toISOString();
  const server = startServer({
    host: config.host,
    port: config.port,
    token,
    context: { office, version: VERSION, startedAt },
    log,
  });
  const info: DaemonInfo = {
    host: config.host,
    port: server.port,
    token,
    pid: process.pid,
    startedAt,
    version: VERSION,
  };
  await Bun.write(daemonInfoPath(home), `${JSON.stringify(info, null, 2)}\n`);
  await chmod(daemonInfoPath(home), 0o600);

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    stopped = true;
    log.info("daemon stopping");
    await server.stop();
    database.close();
    await rm(daemonInfoPath(home), { force: true });
  };
  return { info, office, config, stop };
}
