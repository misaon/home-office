import {
  attachmentsOfTask,
  needsEngine,
  type RemainingBudget,
  type SandboxHandle,
  type SandboxProvider,
} from "@ho/core";
import {
  type Agent,
  type CommitSha,
  imageRefFor,
  type Project,
  PROVIDERS,
  type Session,
  type SessionServices,
  type Task,
} from "@ho/protocol";
import { branchFor, hostGitIdentity } from "./git-bridge.ts";
import { LABELS } from "./labels.ts";
import { sourcePathFor } from "./mirrors.ts";
import type { DiffSummary, Services, WorkBase } from "./prompts-shared.ts";
import type { RunnerConnection } from "./runner-gateway.ts";
import { checkout } from "./session-checkout.ts";
import { sandboxSpec } from "./session-sandbox.ts";
import type { SessionDeps } from "./sessions.ts";
import { type LspLanguage, skillPacksFor } from "./skill-pack.ts";
import { prepareTaskEngine, startServices, type TaskEngineRequest } from "./task-engine.ts";
import { stopwatch } from "./timing.ts";
import { cacheVolumeFor, reviewVolumeFor, taskVolumeFor } from "./volumes.ts";

const SANDBOX_STOP_GRACE_S = 5;

export type SessionContext = {
  session: Session;
  task: Task;
  agent: Agent;
  project: Project;
  previous: Session | undefined;
  signal: AbortSignal;
  budget: RemainingBudget;
};

export type Provisioned = {
  sandbox: SandboxHandle;
  services: Services;
  connection: RunnerConnection;
  volume: string;
  branch: string;
  commit: CommitSha | null;
  base: WorkBase | null;
  diff: DiffSummary | null;
  languages: readonly LspLanguage[];
  imageId: string | null;
  sourcePath: string;
  mcpToken: string;
  labels: Readonly<Record<string, string>>;
  stopServices: () => Promise<void>;
  dispose: () => Promise<void>;
};

export const sessionServicesOf = (services: Services): SessionServices | undefined =>
  services.kind === "off" ? undefined : services.kind;

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

type Wired = {
  issued: ReturnType<RunnerGatewayIssue>;
  mcpToken: string;
  chat: { outbox: string; inbox: string; browser: string };
};

type RunnerGatewayIssue = SessionDeps["gateway"]["issue"];

async function wire(
  deps: SessionDeps,
  ctx: SessionContext,
  stack: AsyncDisposableStack,
): Promise<Wired> {
  const { gateway, mcp, home } = deps;
  const issued = gateway.issue(ctx.session.id, ctx.signal);
  stack.defer(issued.cancel);
  const mcpToken = mcp.register({
    sessionId: ctx.session.id,
    taskId: ctx.task.id,
    mandateId: ctx.task.mandateId,
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
  const browser = await deps.attachments.openBrowserDir(ctx.session.id);
  return { issued, mcpToken, chat: { outbox, inbox, browser } };
}

type Volumes = { volume: string; stateVolume: string; cacheVolume: string };

async function volumesFor(
  provider: SandboxProvider,
  ctx: SessionContext,
  labels: Readonly<Record<string, string>>,
): Promise<Volumes> {
  const reviewing = ctx.session.mode === "review";
  const volume = reviewing ? reviewVolumeFor(ctx.task.id) : taskVolumeFor(ctx.task.id);
  const thread = ctx.session.mode === "triage" ? ctx.session.threadId : undefined;
  const stateVolume =
    thread === undefined
      ? `${taskVolumeFor(ctx.task.id)}-state-${ctx.agent.id.slice(-8)}`
      : `ho-chat-${thread.slice(-12)}-state-${ctx.agent.id.slice(-8)}`;
  await provider.createVolume(volume, {
    ...labels,
    [LABELS.kind]: reviewing ? "review-volume" : "task-volume",
  });
  await provider.createVolume(stateVolume, { ...labels, [LABELS.kind]: "provider-state" });
  const cacheVolume = cacheVolumeFor(ctx.project.id);
  await provider.createVolume(cacheVolume, {
    [LABELS.managed]: "true",
    [LABELS.project]: ctx.project.id,
    [LABELS.kind]: "project-cache",
  });
  return { volume, stateVolume, cacheVolume };
}

export async function provision(deps: SessionDeps, ctx: SessionContext): Promise<Provisioned> {
  const { provider, config, home, log } = deps;
  ctx.signal.throwIfAborted();
  const watch = stopwatch();
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
  const { volume, stateVolume, cacheVolume } = await volumesFor(provider, ctx, labels);
  const sourcePath = await sourcePathFor(home, ctx.project);
  watch.lap("volumesMs");
  log.debug(
    { sessionId: ctx.session.id, volume, stateVolume, branch, sourcePath },
    "volumes ready; preparing the repository",
  );
  const checked = await checkout(deps, ctx, sourcePath, volume, branch);
  watch.lap("repoMs");
  log.debug({ sessionId: ctx.session.id, branch, commit: checked.commit }, "repository prepared");
  const engineRequest: TaskEngineRequest | null = needsEngine(
    config.services.enabled,
    ctx.project,
    ctx.session.mode,
  )
    ? {
        mode: ctx.project.services.mode,
        role: "session",
        sessionId: ctx.session.id,
        workVolume: volume,
        labels,
      }
    : null;
  await using stack = new AsyncDisposableStack();
  const plan =
    engineRequest === null ? null : await prepareTaskEngine(provider, engineRequest, stack);
  const wired = await wire(deps, ctx, stack);
  const sandbox = await provider.start(
    sandboxSpec(
      config,
      ctx,
      volume,
      stateVolume,
      cacheVolume,
      deps.gatewayUrl(),
      wired.issued.token,
      plan,
      wired.chat,
      await hostGitIdentity(),
    ),
  );
  stack.defer(async () => {
    await provider.stop(sandbox, SANDBOX_STOP_GRACE_S).catch(() => null);
    await provider.remove(sandbox).catch(() => null);
  });
  watch.lap("sandboxMs");
  const engine = await startServices(deps, ctx, engineRequest, plan, sandbox, stack);
  if (engineRequest !== null) {
    watch.lap("engineMs");
  }
  log.debug(
    { sessionId: ctx.session.id, sandbox: sandbox.id, services: engine.services.kind },
    "sandbox started; waiting for the runner to connect",
  );
  const connection = await wired.issued.connected;
  ctx.signal.throwIfAborted();
  watch.lap("runnerMs");
  const image = imageRefFor(config.docker.agentImage, PROVIDERS[ctx.agent.provider].image);
  const imageId = await provider.imageId(image).catch((): null => null);
  announceProvisioned(deps, ctx, {
    volume,
    stateVolume,
    cacheVolume,
    branch,
    commit: checked.commit,
    base: checked.base?.branch ?? null,
    diff: checked.diff,
    languages: checked.languages,
    image,
    imageId,
    services: engine.services.kind,
    ...watch.laps(),
    totalMs: watch.total(),
  });
  const owned = stack.move();
  return {
    sandbox,
    services: engine.services,
    connection,
    volume,
    branch,
    commit: checked.commit,
    base: checked.base,
    diff: checked.diff,
    languages: checked.languages,
    imageId,
    sourcePath,
    mcpToken: wired.mcpToken,
    labels,
    stopServices: engine.stop,
    dispose: () => owned.disposeAsync(),
  };
}
