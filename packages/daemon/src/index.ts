import { createIdFactory, ensureOfficeProject } from "@ho/core";
import { createClaudeCodeRuntime } from "@ho/runtime-claude-code";
import { createDockerProvider } from "@ho/sandbox-docker";
import { createSecretStore } from "@ho/secrets";
import { createSqliteEventStore, openDatabase } from "@ho/store";
import { chmod, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type DaemonConfig, loadConfig, resolveHome } from "./config.ts";
import { agentImageSpec, bridgeImageSpec, ensureImages } from "./images.ts";
import { startGc } from "./gc.ts";
import { createLogger } from "./logger.ts";
import { McpGateway } from "./mcp.ts";
import { Office } from "./office.ts";
import { RunnerGateway } from "./runner-gateway.ts";
import { startScheduler } from "./scheduler.ts";
import { startServer } from "./server.ts";
import { SessionManager } from "./sessions.ts";
import { usageSummary } from "./usage.ts";

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
  const secrets = createSecretStore(home, config.secrets.store);
  const provider = createDockerProvider({
    socket: config.docker.socket,
    platform: config.docker.platform,
  });
  const runtime = createClaudeCodeRuntime({
    clock,
    onStderr: (text) => {
      log.debug({ stderr: text.slice(0, 500) }, "claude stderr");
    },
  });
  const gateway = new RunnerGateway(clock, log);
  const mcp = new McpGateway(office, log);
  await office.execute({ kind: "system" }, (m, ctx) => ensureOfficeProject(m, ctx));

  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const startedAt = clock.now().toISOString();
  // The port is known only after listening; sessions read the URL lazily through this holder.
  const gatewayUrl = { value: "" };
  const mcpUrl = { value: "" };
  const sessions = new SessionManager({
    office,
    provider,
    runtime,
    gateway,
    mcp,
    secrets,
    config,
    home,
    log,
    get gatewayUrl() {
      return gatewayUrl.value;
    },
    get mcpUrl() {
      return mcpUrl.value;
    },
  });

  const imageStatus = async (): Promise<{ ref: string; present: boolean; upToDate: boolean }[]> => {
    const specs = [await agentImageSpec(config), await bridgeImageSpec(config)];
    const { createDockerApi } = await import("@ho/sandbox-docker");
    const { imageHash } = await import("./images-hash.ts");
    const api = createDockerApi(config.docker.socket);
    return Promise.all(
      specs.map(async (spec) => {
        const hash = await imageHash(api, spec.ref);
        return { ref: spec.ref, present: hash !== null, upToDate: hash === spec.contentHash };
      }),
    );
  };

  const gc = startGc(provider, config, log);
  const server = startServer({
    host: config.host,
    port: config.port,
    token,
    gateway,
    mcp,
    log,
    context: {
      office,
      sessions,
      provider,
      secrets,
      config,
      version: VERSION,
      startedAt,
      buildImages: (onLine) => ensureImages(provider, config, onLine),
      imageStatus,
      gc: () => gc.runOnce(),
      usage: (sinceHours) => usageSummary(office, store, sinceHours),
    },
  });
  gatewayUrl.value = `ws://${config.docker.gatewayHost}:${String(server.port)}`;
  mcpUrl.value = `http://${config.docker.gatewayHost}:${String(server.port)}${McpGateway.path}`;
  const scheduler = startScheduler(office, sessions, config, log);

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
    scheduler.stop();
    gc.stop();
    await sessions.stopAll();
    await server.stop();
    database.close();
    await rm(daemonInfoPath(home), { force: true });
  };
  return { info, office, config, stop };
}
