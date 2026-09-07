import { createIdFactory } from "@ho/core";
import { createDockerProvider } from "@ho/sandbox-docker";
import { createSecretStore } from "@ho/secrets";
import { mkdir } from "node:fs/promises";
import { startBossVoice } from "./boss-voice.ts";
import { openOffice } from "./open-office.ts";
import { DaemonConfig, loadConfig, resolveHome } from "./config.ts";
import { type DaemonInfo, removeDaemonInfo, writeDaemonInfo } from "./daemon-info.ts";
import { resolveResources } from "./paths.ts";
import { createLogger } from "./logger.ts";
import { OfficeGate } from "./office-gate.ts";
import { startJobs } from "./jobs.ts";
import { McpGateway } from "./mcp.ts";
import type { Office } from "./office.ts";
import { RunnerGateway } from "./runner-gateway.ts";
import { createRpcContext } from "./rpc/context.ts";
import { createRuntimes } from "./runtimes.ts";
import { startServer } from "./server.ts";
import { SessionManager } from "./sessions.ts";

export { DaemonConfig, loadConfig, resolveHome } from "./config.ts";
export { DaemonInfo, daemonInfoPath, readDaemonInfo } from "./daemon-info.ts";
export { defaultResourcesRoot, type Resources, resolveResources } from "./paths.ts";
export { Office } from "./office.ts";

const VERSION = "0.0.0-dev";
export type DaemonHandle = {
  info: DaemonInfo;
  office: Office;
  config: DaemonConfig;
  stop: () => Promise<void>;
};

export type DaemonOptions = {
  /** State directory (config.json, ho.db, daemon.json, logs/); defaults to `HO_HOME` or `~/.config/home-office`. */
  home?: string;
  overrides?: Partial<DaemonConfig>;
  /** Where image contexts, the UI bundle, sprites and migrations live; defaults to the repository. */
  resourcesRoot?: string;
  /** Log to this file instead of stdout (the desktop app has no visible stdout). */
  logFile?: string;
};

export async function startDaemon(options: DaemonOptions = {}): Promise<DaemonHandle> {
  const home = options.home ?? resolveHome();
  await mkdir(home, { recursive: true, mode: 0o700 });
  const resources = resolveResources(options.resourcesRoot);
  const config = DaemonConfig.parse({
    ...(await loadConfig(home, resources)),
    ...options.overrides,
  });
  const log = createLogger(config.logLevel, options.logFile);
  const clock = { now: () => new Date() };
  const ids = createIdFactory(clock, {
    randomize: (bytes) => {
      crypto.getRandomValues(bytes);
    },
  });

  const { database, store, office } = await openOffice(
    home,
    resources.migrationsDir,
    ids,
    clock,
    log,
  );
  const secrets = createSecretStore(home, config.secrets.store);
  const provider = createDockerProvider({
    socket: config.docker.socket,
    platform: config.docker.platform,
  });
  const runtimes = createRuntimes(log, clock);
  const gateway = new RunnerGateway(clock, log);
  const mcp = new McpGateway(office, log);
  const gate = new OfficeGate(log);
  const voice = startBossVoice(office, gate, log);

  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const startedAt = clock.now().toISOString();
  // The port is known only after listening; sessions read the URL lazily through this holder.
  const gatewayUrl = { value: "" };
  const mcpUrl = { value: "" };
  const sessions = new SessionManager({
    office,
    provider,
    runtimes,
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

  const jobs = startJobs({ office, sessions, provider, config, gate, log });
  const server = startServer({
    host: config.host,
    port: config.port,
    token,
    gateway,
    mcp,
    log,
    context: createRpcContext({
      office,
      sessions,
      gate,
      intake: jobs.intake,
      provider,
      secrets,
      config,
      resources,
      store,
      version: VERSION,
      startedAt,
      gc: jobs.gcOnce,
    }),
  });
  gatewayUrl.value = `ws://${config.docker.gatewayHost}:${String(server.port)}`;
  mcpUrl.value = `http://${config.docker.gatewayHost}:${String(server.port)}${McpGateway.path}`;

  const info: DaemonInfo = {
    host: config.host,
    port: server.port,
    token,
    pid: process.pid,
    startedAt,
    version: VERSION,
  };
  await writeDaemonInfo(home, info);

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    stopped = true;
    log.info("daemon stopping");
    voice.stop();
    jobs.stop();
    await sessions.stopAll();
    await server.stop();
    database.close();
    await removeDaemonInfo(home);
  };
  log.info({ home, resources: resources.root }, "daemon started");
  return { info, office, config, stop };
}
