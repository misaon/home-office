import { attachmentsOfTask, needsEngine, type SandboxHandle, type SandboxSpec } from "@ho/core";
import {
  type Agent,
  CHAT_INBOX_DIR,
  CHAT_OUTBOX_DIR,
  errorMessage,
  imageRefFor,
  type Project,
  PROVIDERS,
  type Session,
  type SessionServices,
  type Task,
} from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import {
  branchFor,
  type GitIdentity,
  hostGitIdentity,
  prepareRepo,
  REPO_IN_VOLUME,
} from "./git-bridge.ts";
import { LABELS } from "./labels.ts";
import { sourcePathFor } from "./mirrors.ts";
import type { Services } from "./prompts.ts";
import type { RunnerConnection } from "./runner-gateway.ts";
import type { SessionDeps } from "./sessions.ts";
import { skillPacksFor } from "./skill-pack.ts";
import {
  engineEnv,
  prepareTaskEngine,
  startTaskEngine,
  type TaskEnginePlan,
  type TaskEngineRequest,
} from "./task-engine.ts";
import { stopwatch } from "./timing.ts";

const SANDBOX_STOP_GRACE_S = 5;

const gitIdentity = (
  agent: Agent,
  committer: GitIdentity | null,
): Readonly<Record<string, string>> => {
  const slug = agent.name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  const address = `${slug === "" ? agent.id : slug}@agents.home-office.local`;
  return {
    GIT_AUTHOR_NAME: agent.name,
    GIT_AUTHOR_EMAIL: address,
    GIT_COMMITTER_NAME: committer?.name ?? agent.name,
    GIT_COMMITTER_EMAIL: committer?.email ?? address,
  };
};

export type SessionContext = {
  session: Session;
  task: Task;
  agent: Agent;
  project: Project;
  previous: Session | undefined;
  signal: AbortSignal;
};

export type Provisioned = {
  sandbox: SandboxHandle;
  services: Services;
  connection: RunnerConnection;
  volume: string;
  branch: string;
  sourcePath: string;
  mcpToken: string;
  dispose: () => Promise<void>;
};

export const sessionServicesOf = (services: Services): SessionServices | undefined =>
  services.kind === "off" ? undefined : services.kind;

const sandboxSpec = (
  config: DaemonConfig,
  ctx: SessionContext,
  volume: string,
  stateVolume: string,
  gatewayUrl: string,
  token: string,
  engine: TaskEnginePlan | null,
  chat: { outbox: string; inbox: string },
  committer: GitIdentity | null,
): SandboxSpec => ({
  name: `ho-session-${ctx.session.id.slice(-12)}`,
  ports: ctx.project.preview.enabled ? [ctx.project.preview.port] : [],
  image: imageRefFor(config.docker.agentImage, PROVIDERS[ctx.agent.provider].image),
  cmd: ["bun", "/usr/local/bin/ho-runner.js"],
  env: {
    HO_GATEWAY: gatewayUrl,
    HO_SESSION_TOKEN: token,
    HOME: "/home/agent",
    TERM: "dumb",
    ...gitIdentity(ctx.agent, committer),
    ...(engine === null ? {} : engineEnv(engine.mode)),
  },
  user: "1000:1000",
  workdir: REPO_IN_VOLUME,
  labels: {
    [LABELS.managed]: "true",
    [LABELS.kind]: "session",
    [LABELS.session]: ctx.session.id,
    [LABELS.project]: ctx.project.id,
  },
  network: config.docker.network,
  volumes: [
    { name: volume, target: "/work" },
    { name: stateVolume, target: PROVIDERS[ctx.agent.provider].stateDir },
    ...(engine === null ? [] : [{ name: engine.socketVolume, target: engine.socketDir }]),
  ],
  binds: [
    { source: chat.inbox, target: CHAT_INBOX_DIR, readonly: true },
    { source: chat.outbox, target: CHAT_OUTBOX_DIR, readonly: false },
  ],
  tmpfs: {
    "/tmp": "rw,nosuid,size=256m",
    ...Object.fromEntries(
      PROVIDERS[ctx.agent.provider].scratchDirs.map((dir) => [
        dir,
        "rw,nosuid,size=128m,uid=1000,gid=1000,mode=0755",
      ]),
    ),
  },
  limits: {
    memoryBytes: config.limits.memoryMb * 1024 * 1024,
    cpus: config.limits.cpus,
    pids: config.limits.pids,
  },
  readonlyRootfs: true,
});

async function startServices(
  deps: SessionDeps,
  ctx: SessionContext,
  request: TaskEngineRequest | null,
  plan: TaskEnginePlan | null,
  sandbox: SandboxHandle,
  stack: AsyncDisposableStack,
): Promise<Services> {
  if (request === null || plan === null) {
    return { kind: "off" };
  }
  try {
    const engine = await startTaskEngine(deps.provider, deps.config, request, plan, sandbox);
    stack.defer(async () => {
      await deps.provider.stop(engine, 15).catch(() => null);
      await deps.provider.remove(engine).catch(() => null);
    });
    return { kind: "ready" };
  } catch (error) {
    const message = errorMessage(error).slice(0, 500);
    deps.log.warn(
      { sessionId: ctx.session.id, err: message },
      "task engine did not start; the session continues without its services",
    );
    return { kind: "failed", message };
  }
}

const announceProvisioned = (
  deps: SessionDeps,
  ctx: SessionContext,
  facts: Record<string, unknown>,
): void => {
  deps.log.info(
    { sessionId: ctx.session.id, taskId: ctx.task.id, ...facts },
    "session provisioned",
  );
  deps.traces.write(ctx.session.id, { kind: "provisioned", ...facts }, true);
};

export async function provision(deps: SessionDeps, ctx: SessionContext): Promise<Provisioned> {
  const { provider, config, gateway, mcp, home, log } = deps;
  ctx.signal.throwIfAborted();
  const watch = stopwatch();
  const volume = `ho-task-${ctx.task.id.slice(-12)}`;
  const thread = ctx.session.mode === "triage" ? ctx.session.threadId : undefined;
  const stateVolume =
    thread === undefined
      ? `${volume}-state-${ctx.agent.id.slice(-8)}`
      : `ho-chat-${thread.slice(-12)}-state-${ctx.agent.id.slice(-8)}`;
  const branch = ctx.task.artifacts.branch ?? branchFor(ctx.task.id);
  const labels = {
    [LABELS.managed]: "true",
    [LABELS.session]: ctx.session.id,
    [LABELS.project]: ctx.project.id,
  };
  await provider.ensureNetwork(config.docker.network, {
    [LABELS.managed]: "true",
    [LABELS.kind]: "network",
  });
  await provider.createVolume(volume, { ...labels, [LABELS.kind]: "task-volume" });
  await provider.createVolume(stateVolume, { ...labels, [LABELS.kind]: "provider-state" });
  const sourcePath = await sourcePathFor(home, ctx.project);
  watch.lap("volumesMs");
  log.debug(
    { sessionId: ctx.session.id, volume, stateVolume, branch, sourcePath },
    "volumes ready; preparing the repository",
  );
  await prepareRepo(provider, config, sourcePath, ctx.project.defaultBranch, volume, branch);
  watch.lap("repoMs");
  log.debug({ sessionId: ctx.session.id, branch }, "repository prepared");
  const engineRequest: TaskEngineRequest | null = needsEngine(
    config.services.enabled,
    ctx.project,
    ctx.session.mode,
  )
    ? { mode: ctx.project.services.mode, sessionId: ctx.session.id, taskVolume: volume, labels }
    : null;
  await using stack = new AsyncDisposableStack();
  const plan =
    engineRequest === null ? null : await prepareTaskEngine(provider, engineRequest, stack);
  const issued = gateway.issue(ctx.session.id, ctx.signal);
  stack.defer(issued.cancel);
  const mcpToken = mcp.register({
    sessionId: ctx.session.id,
    taskId: ctx.task.id,
    agentId: ctx.agent.id,
    projectId: ctx.project.id,
    mode: ctx.session.mode,
    provider: ctx.agent.provider,
    skillPacks: skillPacksFor(ctx.agent, ctx.session.mode),
    attachments: deps.attachments,
    home,
  });
  stack.defer(() => {
    mcp.unregister(mcpToken);
  });
  ctx.signal.throwIfAborted();
  const outbox = await deps.attachments.openOutbox(ctx.session.id);
  stack.defer(() => deps.attachments.closeOutbox(ctx.session.id));
  const inbox = await deps.attachments.fillInbox(
    ctx.session.id,
    attachmentsOfTask(deps.office.model, ctx.task),
  );
  stack.defer(() => deps.attachments.closeInbox(ctx.session.id));
  const sandbox = await provider.start(
    sandboxSpec(
      config,
      ctx,
      volume,
      stateVolume,
      deps.gatewayUrl(),
      issued.token,
      plan,
      { outbox, inbox },
      await hostGitIdentity(),
    ),
  );
  stack.defer(async () => {
    await provider.stop(sandbox, SANDBOX_STOP_GRACE_S).catch(() => null);
    await provider.remove(sandbox).catch(() => null);
  });
  watch.lap("sandboxMs");
  const services = await startServices(deps, ctx, engineRequest, plan, sandbox, stack);
  if (engineRequest !== null) {
    watch.lap("engineMs");
  }
  log.debug(
    { sessionId: ctx.session.id, sandbox: sandbox.id, services: services.kind },
    "sandbox started; waiting for the runner to connect",
  );
  const connection = await issued.connected;
  ctx.signal.throwIfAborted();
  watch.lap("runnerMs");
  announceProvisioned(deps, ctx, {
    volume,
    stateVolume,
    branch,
    image: imageRefFor(config.docker.agentImage, PROVIDERS[ctx.agent.provider].image),
    services: services.kind,
    ...watch.laps(),
    totalMs: watch.total(),
  });
  const owned = stack.move();
  return {
    sandbox,
    services,
    connection,
    volume,
    branch,
    sourcePath,
    mcpToken,
    dispose: () => owned.disposeAsync(),
  };
}
