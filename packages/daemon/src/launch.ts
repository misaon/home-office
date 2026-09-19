import { createGithubIssuesConnector } from "@ho/intake-github";
import { createDockerProvider } from "@ho/sandbox-docker";
import { createSecretStore } from "@ho/secrets";
import { type DaemonConfig, loadConfig } from "./config.ts";
import { type DaemonInfo, removeDaemonInfo, writeDaemonInfo } from "./daemon-info.ts";
import { startFloorJobs } from "./floor-jobs.ts";
import { startGc } from "./gc.ts";
import { type DirectoryPicker, osascriptDirectoryPicker } from "./host-dialog.ts";
import { IntakeService } from "./intake.ts";
import { createLogger, type Logger } from "./logger.ts";
import { McpGateway } from "./mcp.ts";
import { OfficeGate } from "./office-gate.ts";
import { openOffice } from "./office.ts";
import { buildsImages, resolveResources, type Resources } from "./paths.ts";
import { RemoteService } from "./remote-service.ts";
import { RunnerGateway } from "./runner-gateway.ts";
import { startServer } from "./server.ts";
import { SkillLibrary } from "./skills.ts";
import { SessionManager } from "./sessions.ts";
import { VERSION } from "./version.ts";

const STOP_TIMEOUT_MS = 60_000;

export type DaemonHandle = {
  info: DaemonInfo;
  config: DaemonConfig;
  stop: () => Promise<void>;
};

export type DaemonOptions = {
  home?: string;
  overrides?: Partial<DaemonConfig>;
  resourcesRoot?: string;
  logFile?: string;
  pickDirectory?: DirectoryPicker;
};

const withDeadline = (work: Promise<void>, ms: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`daemon did not stop within ${String(ms)} ms`));
    }, ms);
    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
    });
  });

const announceStarted = (
  log: Logger,
  started: {
    home: string;
    resources: Resources;
    config: DaemonConfig;
    port: number;
    tracesDir: string;
  },
): void => {
  const { home, resources, config, port, tracesDir } = started;
  log.info(
    {
      home,
      resources: resources.root,
      bun: Bun.version,
      platform: `${process.platform}-${process.arch}`,
      logLevel: config.logLevel,
      port,
      docker: config.docker,
      limits: config.limits,
      scheduler: config.scheduler,
      retention: config.retention,
      browser: config.browser,
      services: { enabled: config.services.enabled, memoryMb: config.services.memoryMb },
      traces: tracesDir,
    },
    "daemon started",
  );
};

export async function launchDaemon(
  options: DaemonOptions,
  home: string,
  cleanup: AsyncDisposableStack,
): Promise<DaemonHandle> {
  const resources = resolveResources(options.resourcesRoot);
  const config = await loadConfig(home, resources, options.overrides ?? {});
  const { log, close: closeLog } = createLogger(config.logLevel, options.logFile);
  cleanup.defer(closeLog);
  const clock = { now: () => new Date() };
  const { office, attachments, traces, close: closeStore } = await openOffice(home, clock, log);
  cleanup.defer(closeStore);
  const secrets = createSecretStore(home, config.secrets.store, (reason) => {
    log.warn({ reason }, "no OS credential store; using the file secret store");
  });
  const provider = createDockerProvider({
    socket: config.docker.socket,
    platform: config.docker.platform,
  });
  const gateway = new RunnerGateway(log, (sessionId, line) => {
    traces.tap(sessionId, line);
  });
  const mcp = new McpGateway(office, new SkillLibrary(resources.pluginsDir), log, traces);
  const gate = new OfficeGate(log);
  let { port } = config;
  const sessions = new SessionManager({
    office,
    provider,
    gateway,
    mcp,
    attachments,
    secrets,
    traces,
    config,
    home,
    log,
    gatewayUrl: () => `ws://${config.docker.gatewayHost}:${String(port)}`,
    mcpUrl: () => `http://${config.docker.gatewayHost}:${String(port)}${McpGateway.path}`,
  });
  await sessions.recover();
  const intake = new IntakeService(office, createGithubIssuesConnector(), log);
  const gc = startGc(provider, config, log, traces);
  cleanup.defer(() => gc.stop());
  const startedAt = clock.now().toISOString();
  const remote = await RemoteService.open(home, clock, log);
  const server = startServer({
    host: config.host,
    port: config.port,
    uiDir: config.ui.dir,
    gateway,
    mcp,
    log,
    context: {
      office,
      sessions,
      attachments,
      gate,
      intake,
      provider,
      secrets,
      config,
      home,
      resources,
      version: VERSION,
      startedAt,
      gc: gc.runOnce,
      pickDirectory: options.pickDirectory ?? osascriptDirectoryPicker,
      remote,
      log,
    },
  });
  cleanup.defer(async () => {
    await sessions.stopAll();
    await server.stop();
  });
  remote.attach(server.remote);
  cleanup.defer(() => {
    remote.stop();
  });
  ({ port } = server);
  const info: DaemonInfo = {
    host: config.host,
    port,
    token: server.token,
    pid: process.pid,
    startedAt,
    version: VERSION,
    serves: { ui: config.ui.dir !== null, images: buildsImages(resources) },
  };
  await writeDaemonInfo(home, info);
  cleanup.defer(() => removeDaemonInfo(home));
  intake.start();
  cleanup.defer(() => intake.stop());
  const jobs = await startFloorJobs({ office, sessions, config, gate, home, log });
  cleanup.defer(() => jobs.stop());
  let stopping: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    if (stopping === null) {
      log.info({}, "daemon stopping");
      stopping = withDeadline(cleanup.disposeAsync(), STOP_TIMEOUT_MS);
    }
    return stopping;
  };
  announceStarted(log, { home, resources, config, port, tracesDir: traces.dir });
  return { info, config, stop };
}
