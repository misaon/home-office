import type { RuntimeEvent, RuntimeSession, SandboxHandle, SandboxSpec } from "@ho/core";
import {
  type Agent,
  imageRefFor,
  type Project,
  PROVIDERS,
  type Session,
  type Task,
  type TaskArtifacts,
} from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { browserMcpServers } from "./browser.ts";
import { branchFor, prepareRepo, pushFromVolume, REPO_IN_VOLUME } from "./git-bridge.ts";
import { LABELS } from "./images.ts";
import { sourcePathFor } from "./mirrors.ts";
import { openingMessage, reviewPrompt, triagePrompt, workPrompt } from "./prompts.ts";
import { deliver } from "./publish.ts";
import type { RunnerConnection } from "./runner-gateway.ts";
import type { SessionDeps } from "./sessions.ts";

const REPORT_MAX = 4000;
const PLUGINS_ROOT = "/opt/ho/plugins";

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
  connection: RunnerConnection;
  volume: string;
  branch: string;
  sourcePath: string;
  mcpToken: string;
};
export type Outcome = {
  report: string;
  failure: string | null;
  runtimeSessionId: string | null;
  sawInit: boolean;
};

const sandboxSpec = (
  config: DaemonConfig,
  ctx: SessionContext,
  volume: string,
  configVolume: string,
  gatewayUrl: string,
  token: string,
): SandboxSpec => ({
  name: `ho-session-${ctx.session.id.slice(-12)}`,
  image: imageRefFor(config.docker.agentImage, PROVIDERS[ctx.agent.provider].image),
  cmd: ["/usr/local/bin/ho-runner"],
  env: { HO_GATEWAY: gatewayUrl, HO_SESSION_TOKEN: token, HOME: "/home/agent", TERM: "dumb" },
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
    // The CLI's conversation state; survives between sessions of the same task and agent (resume).
    { name: configVolume, target: PROVIDERS[ctx.agent.provider].stateDir },
  ],
  binds: [],
  tmpfs: {
    "/tmp": "rw,nosuid,size=256m",
    // Docker mounts tmpfs as root 0755; the sandbox user must own its scratch directories.
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

/** Network, task volume with the floor's repository, sandbox with the runner, runner connection. */
export async function provision(deps: SessionDeps, ctx: SessionContext): Promise<Provisioned> {
  const { provider, config, gateway, mcp, home } = deps;
  ctx.signal.throwIfAborted();
  const volume = `ho-task-${ctx.task.id.slice(-12)}`;
  const configVolume = `${volume}-claude-${ctx.agent.id.slice(-8)}`;
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
  await provider.createVolume(configVolume, { ...labels, [LABELS.kind]: "claude-config" });
  const sourcePath = await sourcePathFor(home, ctx.project);
  await prepareRepo(provider, config, sourcePath, ctx.project.defaultBranch, volume, branch);
  const issued = gateway.issue(ctx.session.id, ctx.signal);
  const mcpToken = mcp.register({
    sessionId: ctx.session.id,
    taskId: ctx.task.id,
    agentId: ctx.agent.id,
    projectId: ctx.project.id,
    mode: ctx.session.mode,
  });
  let sandbox: SandboxHandle | null = null;
  try {
    ctx.signal.throwIfAborted();
    sandbox = await provider.start(
      sandboxSpec(config, ctx, volume, configVolume, deps.gatewayUrl, issued.token),
    );
    const connection = await issued.connected;
    ctx.signal.throwIfAborted();
    return { sandbox, connection, volume, branch, sourcePath, mcpToken };
  } catch (error) {
    issued.cancel();
    mcp.unregister(mcpToken);
    if (sandbox !== null) {
      await provider.stop(sandbox, 2).catch(() => null);
      await provider.remove(sandbox).catch(() => null);
    }
    throw error;
  }
}

const promptFor = (deps: SessionDeps, ctx: SessionContext, branch: string): string => {
  if (ctx.session.mode === "review") {
    return reviewPrompt(ctx.agent, ctx.project, ctx.task, branch, deps.config.browser.enabled);
  }
  if (ctx.session.mode === "triage") {
    return triagePrompt(ctx.agent, ctx.project, deps.office.model);
  }
  return workPrompt(ctx.agent, ctx.project, ctx.task, branch, deps.config.browser.enabled);
};

const openRuntime = (
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  secrets: Readonly<Record<string, string>>,
  resume: string | null,
): Promise<RuntimeSession> =>
  deps.runtimes[ctx.agent.provider].open(
    {
      sessionId: ctx.session.id,
      taskId: ctx.task.id,
      agentId: ctx.agent.id,
      provider: ctx.agent.provider,
      auth: ctx.agent.auth,
      model: ctx.agent.model,
      effort: ctx.agent.effort,
      maxTurns: ctx.agent.budgets.maxTurnsPerTask,
      maxUsd: ctx.agent.budgets.maxUsdPerTask ?? null,
      systemPromptAppendix: promptFor(deps, ctx, provisioned.branch),
      cwd: REPO_IN_VOLUME,
      resume,
      pluginDirs: ctx.agent.skillPack === "none" ? [] : [`${PLUGINS_ROOT}/${ctx.agent.skillPack}`],
      mcpServers: {
        ho: {
          kind: "http",
          url: deps.mcpUrl,
          headers: { Authorization: `Bearer ${provisioned.mcpToken}` },
        },
        ...(deps.config.browser.enabled && ctx.session.mode !== "triage"
          ? browserMcpServers(deps.config.browser.devtools)
          : {}),
      },
    },
    provisioned.connection.channel,
    secrets,
  );

/** Drives one prompt to its result, forwarding every event to `onEvent` (live fan-out + persistence). */
async function consume(
  runtimeSession: RuntimeSession,
  ctx: SessionContext,
  message: string,
  onEvent: (event: RuntimeEvent) => Promise<void>,
): Promise<Outcome> {
  const outcome: Outcome = { report: "", failure: null, runtimeSessionId: null, sawInit: false };
  let sawResult = false;
  for await (const event of runtimeSession.prompt({ text: message }, ctx.signal)) {
    await onEvent(event);
    switch (event.kind) {
      case "init": {
        outcome.sawInit = true;
        outcome.runtimeSessionId = event.runtimeSessionId;
        break;
      }
      case "result": {
        sawResult = true;
        outcome.report = event.text.slice(0, REPORT_MAX);
        outcome.runtimeSessionId = event.runtimeSessionId ?? outcome.runtimeSessionId;
        if (!event.ok && outcome.failure === null) {
          outcome.failure = "the agent reported an error";
        }
        break;
      }
      case "error": {
        outcome.failure = `${event.code}: ${event.message}`;
        break;
      }
      case "usage":
      case "rate_limited":
      case "text_delta":
      case "tool_call":
      case "tool_result":
      case "permission_request": {
        break;
      }
    }
  }
  if (ctx.signal.aborted && outcome.failure === null) {
    outcome.failure = "session aborted (time budget or shutdown)";
  }
  if (!sawResult && outcome.failure === null) {
    outcome.failure = "runtime ended without a result";
  }
  return outcome;
}

/**
 * Runs the session's single prompt, resuming the agent's earlier conversation when one exists. A resume that
 * dies before `init` (the conversation is gone) is retried once as a fresh conversation.
 */
export async function runPrompt(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  secrets: Readonly<Record<string, string>>,
  onEvent: (event: RuntimeEvent) => Promise<void>,
): Promise<Outcome> {
  const message = openingMessage(ctx.task, ctx.session.mode, ctx.previous);
  const resume = ctx.previous?.runtimeSessionId ?? null;
  let runtimeSession = await openRuntime(deps, ctx, provisioned, secrets, resume);
  try {
    let outcome = await consume(runtimeSession, ctx, message, onEvent);
    if (
      resume !== null &&
      !outcome.sawInit &&
      outcome.failure?.startsWith("process_exit") === true &&
      !ctx.signal.aborted
    ) {
      deps.log.warn(
        { sessionId: ctx.session.id, resume },
        "resume failed; starting a fresh conversation",
      );
      await runtimeSession.close().catch(() => null);
      runtimeSession = await openRuntime(deps, ctx, provisioned, secrets, null);
      outcome = await consume(
        runtimeSession,
        ctx,
        `${message}\n\n(Your earlier conversation could not be restored; the notes above are the full context.)`,
        onEvent,
      );
    }
    return outcome;
  } finally {
    await runtimeSession.close().catch(() => null);
  }
}

/** Pushes the branch back to the source repository, then (per project policy) opens a pull request. */
export async function publish(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  report: string,
): Promise<TaskArtifacts> {
  await pushFromVolume(
    deps.provider,
    deps.config,
    provisioned.sourcePath,
    provisioned.volume,
    provisioned.branch,
  );
  return deliver(deps.home, ctx.project, ctx.task, provisioned.branch, report);
}
