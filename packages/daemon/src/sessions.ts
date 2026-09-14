import {
  activeSessions,
  type AgentRuntime,
  changeSessionState,
  createChannel,
  endSession,
  rateLimitedReason,
  recordSessionUsage,
  type SandboxProvider,
  type SecretStore,
  startSession,
  transitionTask,
} from "@ho/core";
import {
  compact,
  errorMessage,
  type LiveEvent,
  type ProviderId,
  type RuntimeEvent,
  type Session,
  type SessionId,
  type SessionMode,
  type SessionServices,
  type SessionState,
  SYSTEM_ACTOR,
  type TaskId,
} from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import { LABELS } from "./labels.ts";
import type { AttachmentStore } from "./attachments.ts";
import type { Logger } from "./logger.ts";
import type { McpGateway } from "./mcp.ts";
import type { Office } from "./office.ts";
import { secretEnvFor } from "./provider-secrets.ts";
import type { RunnerGateway } from "./runner-gateway.ts";
import {
  provision,
  type Provisioned,
  type SessionContext,
  sessionServicesOf,
} from "./session-provision.ts";
import { runPrompt } from "./session-run.ts";
import { settle } from "./session-settle.ts";

export type SessionDeps = {
  office: Office;
  provider: SandboxProvider;
  runtimes: Readonly<Record<ProviderId, AgentRuntime>>;
  gateway: RunnerGateway;
  mcp: McpGateway;
  attachments: AttachmentStore;
  secrets: SecretStore;
  config: DaemonConfig;
  home: string;
  /** Known only once the server listens, so sessions ask at start time. */
  gatewayUrl: () => string;
  mcpUrl: () => string;
  log: Logger;
};

type Subscriber = { sessionId: SessionId | null; push: (event: LiveEvent) => void };

const RESTART_REASON =
  "daemon restarted before the session finished; inspect the task branch and resume explicitly";

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

  /**
   * After a restart: sessions the previous daemon left active are failed, their containers removed and
   * their tasks blocked for explicit resumption. A Docker that does not answer only skips the removal —
   * garbage collection prunes the labelled containers later — so the office still starts.
   */
  async recover(): Promise<void> {
    const { office, provider, log } = this.#deps;
    const active = activeSessions(office.model);
    if (active.length === 0) {
      return;
    }
    const inventory = await provider
      .inventory({ [LABELS.managed]: "true" })
      .catch((error: unknown) => {
        log.warn(
          { err: errorMessage(error) },
          "docker did not answer; abandoned containers are left to gc",
        );
        return null;
      });
    const abandoned = (inventory?.containers ?? []).filter(
      (item) => item.kind === "session" || item.kind === "engine",
    );
    for (const session of active) {
      for (const container of abandoned.filter((item) => item.sessionId === session.id)) {
        const handle = { id: container.name, name: container.name };
        await provider.stop(handle, 2).catch(() => null);
        await provider.remove(handle).catch(() => null);
      }
      await this.#end(session.id, "failed", RESTART_REASON);
      await this.#block(session.taskId, RESTART_REASON);
    }
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
    const session = await office.execute(SYSTEM_ACTOR, (m, ctx) =>
      startSession(m, { taskId, agentId, mode }, ctx),
    );
    const previous =
      session.resumedFrom === undefined
        ? undefined
        : office.model.sessions.get(session.resumedFrom);
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
    })
      .catch((error: unknown) => {
        // #run handles its own failures; this catches a teardown that throws after the work is done.
        this.#deps.log.error(
          { sessionId: session.id, err: errorMessage(error) },
          "session teardown failed",
        );
      })
      .finally(() => {
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
    extra: {
      runtimeSessionId?: string;
      sandboxId?: string;
      services?: SessionServices;
      reason?: string;
    } = {},
  ): Promise<Session> {
    return this.#deps.office.execute(SYSTEM_ACTOR, (m, ctx) =>
      changeSessionState(m, { sessionId, state, ...extra }, ctx),
    );
  }

  #end(sessionId: SessionId, state: "stopped" | "failed", reason?: string): Promise<Session> {
    return this.#deps.office.execute(SYSTEM_ACTOR, (m, ctx) =>
      endSession(m, { sessionId, state, ...compact({ reason }) }, ctx),
    );
  }

  /** A task whose session died mid-way waits for a human: a blocked task is not picked up again by itself. */
  async #block(taskId: TaskId, reason: string): Promise<void> {
    const status = this.#deps.office.model.tasks.get(taskId)?.status;
    if (status === "in_progress" || status === "review" || status === "assigned") {
      await this.#deps.office
        .execute(SYSTEM_ACTOR, (m, c) =>
          transitionTask(m, { id: taskId, to: "blocked", reason }, c),
        )
        .catch(() => null);
    }
  }

  async #onEvent(ctx: SessionContext, event: RuntimeEvent): Promise<void> {
    this.#emit(ctx.session.id, event);
    const { office } = this.#deps;
    if (event.kind === "usage") {
      await office.execute(SYSTEM_ACTOR, (m, c) =>
        recordSessionUsage(m, { sessionId: ctx.session.id, usage: event.usage }, c),
      );
    } else if (event.kind === "rate_limited") {
      await this.#state(ctx.session.id, "idle", { reason: rateLimitedReason(event.retryAt) });
    } else if (event.kind === "init") {
      await this.#state(ctx.session.id, "running", { runtimeSessionId: event.runtimeSessionId });
    } else if (
      (event.kind === "text_delta" || event.kind === "tool_call") &&
      office.model.sessions.get(ctx.session.id)?.state === "idle"
    ) {
      await this.#state(ctx.session.id, "running");
    }
  }

  async #run(ctx: SessionContext): Promise<void> {
    const { log } = this.#deps;
    const sessionId = ctx.session.id;
    let provisioned: Provisioned | null = null;
    try {
      const secretEnv = await secretEnvFor(this.#deps.secrets, ctx.agent);
      provisioned = await provision(this.#deps, ctx);
      await this.#state(sessionId, "starting", {
        sandboxId: provisioned.sandbox.id,
        ...compact({ services: sessionServicesOf(provisioned.services) }),
      });
      log.info(
        {
          sessionId,
          mode: ctx.session.mode,
          resume: ctx.previous?.runtimeSessionId ?? null,
          uid: provisioned.connection.uid,
        },
        "runner connected",
      );
      const outcome = await runPrompt(this.#deps, ctx, provisioned, secretEnv, (event) =>
        this.#onEvent(ctx, event),
      );
      await this.#state(sessionId, "stopping");
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
      await this.#block(ctx.task.id, message);
      await this.#end(sessionId, "failed", message).catch(() => null);
    } finally {
      await provisioned?.dispose();
    }
  }
}
