import {
  type AgentRuntime,
  changeSessionState,
  createChannel,
  endSession,
  rateLimitedReason,
  recordSessionUsage,
  resumableSession,
  type RuntimeEvent,
  type SandboxProvider,
  type TaskEngineProvider,
  type SecretStore,
  startSession,
  transitionTask,
} from "@ho/core";
import {
  compact,
  errorMessage,
  type LiveEvent,
  type ProviderId,
  type Session,
  type SessionId,
  type SessionMode,
  type SessionState,
  type TaskId,
} from "@ho/protocol";
import { secretEnvFor } from "./auth.ts";
import type { DaemonConfig } from "./config.ts";
import type { Logger } from "./logger.ts";
import type { McpGateway } from "./mcp.ts";
import type { Office } from "./office.ts";
import type { RunnerGateway } from "./runner-gateway.ts";
import { provision, type Provisioned, type SessionContext } from "./session-provision.ts";
import { runPrompt } from "./session-run.ts";
import { settle } from "./settle.ts";

const SYSTEM = { kind: "system" } as const;

export type SessionDeps = {
  office: Office;
  provider: SandboxProvider & TaskEngineProvider;
  runtimes: Readonly<Record<ProviderId, AgentRuntime>>;
  gateway: RunnerGateway;
  mcp: McpGateway;
  secrets: SecretStore;
  config: DaemonConfig;
  home: string;
  readonly gatewayUrl: string;
  readonly mcpUrl: string;
  log: Logger;
};

type Subscriber = { sessionId: SessionId | null; push: (event: LiveEvent) => void };

/** Runs sessions end to end: sandbox, git-bridge, runtime, MCP tools, live fan-out, persisted outcomes. */
export class SessionManager {
  readonly #deps: SessionDeps;
  readonly #subscribers = new Set<Subscriber>();
  readonly #running = new Map<SessionId, { controller: AbortController; done: Promise<void> }>();
  #stopping = false;
  readonly #starting = new Set<Promise<Session>>();

  constructor(deps: SessionDeps) {
    this.#deps = deps;
  }

  get activeCount(): number {
    return this.#deps.office.model.activeSessions.size;
  }

  /** Live runtime events for the UI and CLI. Not persisted. */
  stream(sessionId: SessionId | null, signal?: AbortSignal): AsyncIterable<LiveEvent> {
    const subscriber: Subscriber = {
      sessionId,
      push: (event) => {
        channel.push(event);
      },
    };
    const channel = createChannel<LiveEvent>(signal, {
      onClose: () => {
        this.#subscribers.delete(subscriber);
      },
    });
    if (!channel.closed) {
      this.#subscribers.add(subscriber);
    }
    return channel.iterate();
  }

  start(taskId: TaskId, agentId: Session["agentId"], mode: SessionMode): Promise<Session> {
    if (this.#stopping) {
      return Promise.reject(new Error("daemon is stopping"));
    }
    const started = this.#start(taskId, agentId, mode).finally(() => {
      this.#starting.delete(started);
    });
    this.#starting.add(started);
    return started;
  }

  async #start(taskId: TaskId, agentId: Session["agentId"], mode: SessionMode): Promise<Session> {
    const { office } = this.#deps;
    const task = office.model.tasks.get(taskId);
    const agent = office.model.agents.get(agentId);
    const project = task === undefined ? undefined : office.model.projects.get(task.projectId);
    if (task === undefined || agent === undefined || project === undefined) {
      throw new Error(`cannot start a session for task ${taskId}: task, agent or project missing`);
    }
    const previous = resumableSession(office.model, taskId, agentId);
    const session = await office.execute(SYSTEM, (m, ctx) =>
      startSession(m, { taskId, agentId, mode }, ctx),
    );
    const controller = new AbortController();
    const budget = setTimeout(() => {
      this.#deps.log.warn({ sessionId: session.id }, "wall-time budget exhausted");
      controller.abort();
    }, agent.budgets.maxWallMinutes * 60_000);
    if (this.#stopping) {
      controller.abort();
    }
    const done = this.#run({
      session,
      task,
      agent,
      project,
      previous,
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(budget);
      this.#running.delete(session.id);
    });
    this.#running.set(session.id, { controller, done });
    return session;
  }

  async stopAll(): Promise<void> {
    this.#stopping = true;
    await Promise.allSettled(this.#starting);
    const running = [...this.#running.values()];
    for (const { controller } of running) {
      controller.abort();
    }
    await Promise.allSettled(running.map(({ done }) => done));
  }

  #emit(sessionId: SessionId, event: RuntimeEvent): void {
    const live: LiveEvent = { sessionId, at: this.#deps.office.clock.now().toISOString(), event };
    for (const subscriber of this.#subscribers) {
      if (subscriber.sessionId === null || subscriber.sessionId === sessionId) {
        subscriber.push(live);
      }
    }
  }

  #state(
    sessionId: SessionId,
    state: SessionState,
    extra: { runtimeSessionId?: string; sandboxId?: string; reason?: string } = {},
  ): Promise<Session> {
    return this.#deps.office.execute(SYSTEM, (m, ctx) =>
      changeSessionState(m, { sessionId, state, ...extra }, ctx),
    );
  }

  #end(sessionId: SessionId, state: "stopped" | "failed", reason?: string): Promise<Session> {
    return this.#deps.office.execute(SYSTEM, (m, ctx) =>
      endSession(m, { sessionId, state, ...compact({ reason }) }, ctx),
    );
  }

  async #onEvent(ctx: SessionContext, event: RuntimeEvent): Promise<void> {
    this.#emit(ctx.session.id, event);
    if (event.kind === "usage") {
      await this.#deps.office.execute(SYSTEM, (m, c) =>
        recordSessionUsage(m, { sessionId: ctx.session.id, usage: event.usage }, c),
      );
    } else if (event.kind === "rate_limited") {
      await this.#state(ctx.session.id, "idle", {
        reason: rateLimitedReason(event.retryAt),
      });
    } else if (event.kind === "init") {
      await this.#state(ctx.session.id, "running", { runtimeSessionId: event.runtimeSessionId });
    }
  }

  async #run(ctx: SessionContext): Promise<void> {
    const { office, provider, secrets, mcp, log } = this.#deps;
    const sessionId = ctx.session.id;
    let provisioned: Provisioned | null = null;
    try {
      const secretEnv = await secretEnvFor(secrets, ctx.agent);
      provisioned = await provision(this.#deps, ctx);
      await this.#state(sessionId, "starting", { sandboxId: provisioned.sandbox.id });
      log.info(
        {
          sessionId,
          mode: ctx.session.mode,
          resume: ctx.previous?.runtimeSessionId ?? null,
          uid: provisioned.connection.hello.uid,
        },
        "runner connected",
      );
      await this.#state(sessionId, "running");
      const outcome = await runPrompt(this.#deps, ctx, provisioned, secretEnv, (event) =>
        this.#onEvent(ctx, event),
      );
      await this.#state(sessionId, "stopping");
      provisioned.connection.close();
      await settle(this.#deps, ctx, provisioned, outcome);
      await this.#end(
        sessionId,
        outcome.failure === null ? "stopped" : "failed",
        outcome.failure ?? undefined,
      );
    } catch (error) {
      const message = errorMessage(error).slice(0, 2000);
      log.error({ sessionId, err: message }, "session failed");
      this.#emit(sessionId, { kind: "error", code: "unknown", message });
      const status = office.model.tasks.get(ctx.task.id)?.status;
      if (status === "in_progress" || status === "review" || status === "assigned") {
        await office
          .execute(SYSTEM, (m, c) =>
            transitionTask(m, { id: ctx.task.id, to: "blocked", reason: message }, c),
          )
          .catch(() => null);
      }
      await this.#end(sessionId, "failed", message).catch(() => null);
    } finally {
      if (provisioned !== null) {
        provisioned.connection.close();
        mcp.unregister(provisioned.mcpToken);
        // The engine goes first: stopping it lets dockerd signal the repository's own services.
        if (provisioned.engine !== null) {
          await provider.stopEngine(provisioned.engine).catch(() => null);
          await provider.remove(provisioned.engine).catch(() => null);
        }
        await provider.stop(provisioned.sandbox, 5).catch(() => null);
        await provider.remove(provisioned.sandbox).catch(() => null);
      }
    }
  }
}
