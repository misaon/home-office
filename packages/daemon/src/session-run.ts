import {
  type RuntimeEvent,
  type RuntimeSession,
  type SandboxHandle,
  type SandboxSpec,
} from "@ho/core";
import type { Agent, Project, Session, Task } from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { branchFor, cloneIntoVolume, pushFromVolume, REPO_IN_VOLUME } from "./git-bridge.ts";
import { LABELS } from "./images.ts";
import { rolePrompt, taskBrief } from "./prompts.ts";
import type { RunnerConnection } from "./runner-gateway.ts";
import type { SessionDeps } from "./sessions.ts";

export const OAUTH_SECRET = "anthropic-oauth-token";
const REPORT_MAX = 4000;
const CONNECT_TIMEOUT_MS = 30_000;

export type SessionContext = {
  session: Session;
  task: Task;
  agent: Agent;
  project: Project;
  signal: AbortSignal;
};
export type Provisioned = {
  sandbox: SandboxHandle;
  connection: RunnerConnection;
  volume: string;
  branch: string;
};
export type Outcome = { report: string; failure: string | null; runtimeSessionId: string | null };

const sandboxSpec = (
  config: DaemonConfig,
  ctx: SessionContext,
  volume: string,
  gatewayUrl: string,
  token: string,
): SandboxSpec => ({
  name: `ho-session-${ctx.session.id.slice(-12)}`,
  image: config.docker.agentImage,
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
    { name: `${volume}-claude`, target: "/home/agent/.claude" },
  ],
  binds: [],
  tmpfs: { "/tmp": "rw,nosuid,size=256m" },
  limits: {
    memoryBytes: config.limits.memoryMb * 1024 * 1024,
    cpus: config.limits.cpus,
    pids: config.limits.pids,
  },
  readonlyRootfs: true,
});

/** Network, task volume with the cloned repo, sandbox with the runner, and the runner's connection. */
export async function provision(deps: SessionDeps, ctx: SessionContext): Promise<Provisioned> {
  const { provider, config, gateway } = deps;
  const volume = `ho-task-${ctx.task.id.slice(-12)}`;
  const branch = branchFor(ctx.task.title, ctx.task.id);
  await provider.ensureNetwork(config.docker.network, {
    [LABELS.managed]: "true",
    [LABELS.kind]: "network",
  });
  await provider.createVolume(volume, {
    [LABELS.managed]: "true",
    [LABELS.kind]: "task-volume",
    [LABELS.session]: ctx.session.id,
  });
  await cloneIntoVolume(provider, config, ctx.project, volume, branch);
  const issued = gateway.issue(ctx.session.id, ctx.signal);
  const sandbox = await provider.start(
    sandboxSpec(config, ctx, volume, deps.gatewayUrl, issued.token),
  );
  try {
    const connection = await Promise.race([
      issued.connected,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("runner did not connect within 30s"));
        }, CONNECT_TIMEOUT_MS);
      }),
    ]);
    return { sandbox, connection, volume, branch };
  } catch (error) {
    await provider.stop(sandbox, 2).catch(() => null);
    await provider.remove(sandbox).catch(() => null);
    throw error;
  }
}

export const openRuntime = (
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  token: string,
): Promise<RuntimeSession> =>
  deps.runtime.open(
    {
      sessionId: ctx.session.id,
      taskId: ctx.task.id,
      agentId: ctx.agent.id,
      model: ctx.agent.model,
      effort: ctx.agent.effort,
      maxTurns: ctx.agent.budgets.maxTurnsPerTask,
      systemPromptAppendix: rolePrompt(ctx.agent, ctx.project, ctx.task, provisioned.branch),
      cwd: REPO_IN_VOLUME,
      resume: null,
    },
    provisioned.connection.channel,
    { CLAUDE_CODE_OAUTH_TOKEN: token },
  );

/** Drives one prompt to its result, forwarding every event to `onEvent` (live fan-out + persistence). */
export async function consume(
  runtimeSession: RuntimeSession,
  ctx: SessionContext,
  onEvent: (event: RuntimeEvent) => Promise<void>,
): Promise<Outcome> {
  const outcome: Outcome = { report: "", failure: null, runtimeSessionId: null };
  for await (const event of runtimeSession.prompt({ text: taskBrief(ctx.task) }, ctx.signal)) {
    await onEvent(event);
    switch (event.kind) {
      case "result": {
        outcome.report = event.text.slice(0, REPORT_MAX);
        outcome.runtimeSessionId = event.runtimeSessionId;
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
  return outcome;
}

/** Pushes the branch back to the host repository when the agent succeeded. */
export async function publish(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
): Promise<void> {
  await pushFromVolume(
    deps.provider,
    deps.config,
    ctx.project,
    provisioned.volume,
    provisioned.branch,
  );
}
