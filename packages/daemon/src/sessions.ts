import {
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
import type { AttachmentStore } from "./attachments.ts";
import type { Logger } from "./logger.ts";
import type { McpGateway } from "./mcp.ts";
import type { Office } from "./office.ts";
import type { RunnerGateway } from "./runner-gateway.ts";
import { createRuntimes } from "./runtimes.ts";
import type { Provisioned, SessionContext } from "./session-provision.ts";
import { recordSessionEnd, traceHeader } from "./session-record.ts";
import { recoverSessions } from "./session-recover.ts";
import { type Ending, runSession } from "./session-run.ts";
import { gapOf, traceOf } from "./session-trace.ts";
import { elapsedMs } from "./timing.ts";
import type { TraceStore } from "./traces.ts";

export type SessionDeps = {
  office: Office;
  provider: SandboxProvider;
  runtimes: Readonly<Record<ProviderId, AgentRuntime>>;
  gateway: RunnerGateway;
  mcp: McpGateway;
  attachments: AttachmentStore;
  secrets: SecretStore;
  traces: TraceStore;
  config: DaemonConfig;
  home: string;
  gatewayUrl: () => string;
  mcpUrl: () => string;
  log: Logger;
};

type Subscriber = { sessionId: SessionId | null; push: (event: LiveEvent) => void };

type Running = { taskId: TaskId; controller: AbortController; done: Promise<void> };

export class SessionManager {
  readonly #deps: SessionDeps;
  readonly #subscribers = new Set<Subscriber>();
  readonly #running = new Map<SessionId, Running>();
  #stopping = false;
  readonly #starting = new Set<Promise<Session>>();

  constructor(deps: Omit<SessionDeps, "runtimes">) {
    this.#deps = { ...deps, runtimes: createRuntimes(deps.log, deps.office.clock) };
  }

  async recover(): Promise<void> {
    await recoverSessions(
      this.#deps,
      (id, reason) => this.#end(id, { state: "failed", reason }),
      (taskId, reason) => this.#block(taskId, reason),
    );
  }

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
    const { office, log, traces } = this.#deps;
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
    log.info(
      {
        sessionId: session.id,
        taskId,
        agentId,
        agent: agent.name,
        mode,
        resumedFrom: previous?.id,
      },
      "session starting",
    );
    traces.open(session.id, traceHeader(session, task, agent, project, previous));
    const controller = new AbortController();
    const budget = setTimeout(() => {
      log.warn({ sessionId: session.id, taskId }, "wall-time budget exhausted");
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
        log.error({ sessionId: session.id, err: errorMessage(error) }, "session teardown failed");
      })
      .finally(() => {
        clearTimeout(budget);
        this.#running.delete(session.id);
      });
    this.#running.set(session.id, { taskId, controller, done });
    return session;
  }

  stop(sessionId: SessionId): boolean {
    const running = this.#running.get(sessionId);
    if (running === undefined) {
      return false;
    }
    running.controller.abort();
    return true;
  }

  async stopTask(taskId: TaskId): Promise<void> {
    const running = [...this.#running.values()].filter((entry) => entry.taskId === taskId);
    for (const { controller } of running) {
      controller.abort();
    }
    await Promise.allSettled(running.map(({ done }) => done));
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

  #end(sessionId: SessionId, ending: Ending): Promise<Session> {
    return this.#deps.office.execute(SYSTEM_ACTOR, (m, ctx) =>
      endSession(m, { sessionId, state: ending.state, ...compact({ reason: ending.reason }) }, ctx),
    );
  }

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
    this.#deps.traces.observe(ctx.session.id, event);
    const gap = gapOf(event);
    if (gap !== null) {
      this.#deps.log.warn(
        { sessionId: ctx.session.id, taskId: ctx.task.id, agent: ctx.agent.name, ...gap },
        "the sandbox lacks a tool the agent reached for",
      );
    }
    const trace = traceOf(event);
    if (trace !== null) {
      this.#deps.log.debug(
        { sessionId: ctx.session.id, taskId: ctx.task.id, agent: ctx.agent.name, ...trace },
        `agent ${event.kind}`,
      );
    }
    const { office } = this.#deps;
    if (event.kind === "usage") {
      await office.execute(SYSTEM_ACTOR, (m, c) =>
        recordSessionUsage(
          m,
          { sessionId: ctx.session.id, usage: event.usage, ...compact({ costUsd: event.costUsd }) },
          c,
        ),
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
    const started = Bun.nanoseconds();
    const held: { provisioned: Provisioned | null } = { provisioned: null };
    let ending: Ending;
    try {
      ending = await runSession(
        this.#deps,
        ctx,
        (provisioned) => {
          held.provisioned = provisioned;
        },
        (event) => this.#onEvent(ctx, event),
      );
    } catch (error) {
      const message = errorMessage(error).slice(0, 2000);
      log.error({ sessionId, taskId: ctx.task.id, err: message }, "session failed");
      this.#emit(sessionId, { kind: "error", code: "unknown", message });
      await this.#block(ctx.task.id, message);
      ending = { state: "failed", reason: message };
    } finally {
      await held.provisioned?.dispose();
    }
    await this.#end(sessionId, ending).catch(() => null);
    await recordSessionEnd(this.#deps, ctx, ending, elapsedMs(started));
  }
}
