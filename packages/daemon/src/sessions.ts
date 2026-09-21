import {
  type AgentRuntime,
  createChannel,
  endSession,
  type SandboxProvider,
  type SecretStore,
  sessionBudget,
  startSession,
  transitionTask,
  wallMinutesFor,
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
  SYSTEM_ACTOR,
  type TaskId,
} from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import type { AttachmentStore } from "./attachments.ts";
import { REPO_IN_VOLUME } from "./git-bridge.ts";
import type { Logger } from "./logger.ts";
import type { McpGateway } from "./mcp.ts";
import type { Office } from "./office.ts";
import type { RunnerGateway } from "./runner-gateway.ts";
import { createRuntimes } from "./runtimes.ts";
import { handleRuntimeEvent, type Spent } from "./session-events.ts";
import type { Provisioned, SessionContext } from "./session-provision.ts";
import { recordSessionEnd, traceHeader } from "./session-record.ts";
import { recoverSessions } from "./session-recover.ts";
import { type Ending, runSession } from "./session-run.ts";
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

const LOW_TURNS = 20;

type Subscriber = { sessionId: SessionId | null; push: (event: LiveEvent) => void };

type Running = {
  taskId: TaskId;
  controller: AbortController;
  done: Promise<void>;
  spent: Spent;
};

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
    const budget = sessionBudget(office.model, agent, task, mode, project.acceptance);
    if (mode !== "review" && budget.turns < LOW_TURNS) {
      log.warn(
        { taskId, agentId, agent: agent.name, turnsLeft: budget.turns, round: task.reviewRounds },
        "the session starts with few turns left in this round",
      );
    }
    const session = await office
      .traced({ correlationId: task.mandateId })
      .execute(SYSTEM_ACTOR, (m, ctx) => startSession(m, { taskId, agentId, mode }, ctx));
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
        budget,
      },
      "session starting",
    );
    try {
      traces.open(session.id, traceHeader(session, task, agent, project, previous));
    } catch (error) {
      const reason = `the session trace could not be opened: ${errorMessage(error)}`;
      await this.#end(session.id, { state: "failed", reason }).catch(() => null);
      await this.#block(taskId, reason);
      throw new Error(reason, { cause: error });
    }
    const controller = new AbortController();
    const wallMinutes = wallMinutesFor(agent, task);
    const wall = setTimeout(() => {
      log.warn({ sessionId: session.id, taskId, wallMinutes }, "wall-time budget exhausted");
      controller.abort(new Error(`wall-time budget of ${String(wallMinutes)} minute(s) exhausted`));
    }, wallMinutes * 60_000);
    if (this.#stopping) {
      controller.abort(new Error("daemon is stopping"));
    }
    const ctx: SessionContext = {
      session,
      task,
      agent,
      project,
      previous,
      signal: controller.signal,
      budget,
    };
    const done = this.#run(ctx)
      .catch((error: unknown) => {
        log.error({ sessionId: session.id, err: errorMessage(error) }, "session teardown failed");
      })
      .finally(() => {
        clearTimeout(wall);
        this.#running.delete(session.id);
      });
    this.#running.set(session.id, {
      taskId,
      controller,
      done,
      spent: { toolCalls: 0, costUsd: null, overheadWarned: false },
    });
    return session;
  }

  stop(sessionId: SessionId): boolean {
    const running = this.#running.get(sessionId);
    if (running === undefined) {
      return false;
    }
    running.controller.abort(new Error("stopped by the human"));
    return true;
  }

  async stopTask(taskId: TaskId): Promise<void> {
    const running = [...this.#running.values()].filter((entry) => entry.taskId === taskId);
    for (const { controller } of running) {
      controller.abort(new Error("the task was stopped"));
    }
    await Promise.allSettled(running.map(({ done }) => done));
  }

  async stopAll(): Promise<void> {
    this.#stopping = true;
    await Promise.allSettled(this.#starting);
    const running = [...this.#running.values()];
    for (const { controller } of running) {
      controller.abort(new Error("daemon is stopping"));
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

  #end(sessionId: SessionId, ending: Ending): Promise<Session> {
    const input = { sessionId, state: ending.state, ...compact({ reason: ending.reason }) };
    return this.#deps.office
      .traced({ causationId: sessionId })
      .execute(SYSTEM_ACTOR, (m, ctx) => endSession(m, input, ctx));
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
    if (event.kind === "file_change" && !event.path.startsWith(`${REPO_IN_VOLUME}/`)) {
      this.#deps.log.debug(
        { sessionId: ctx.session.id, path: event.path },
        "file change outside the repository kept out of the chat",
      );
      return;
    }
    this.#emit(ctx.session.id, event);
    const running = this.#running.get(ctx.session.id);
    const reason = await handleRuntimeEvent(
      this.#deps,
      ctx,
      event,
      running?.spent ?? { toolCalls: 0, costUsd: null, overheadWarned: false },
    );
    if (reason !== null) {
      running?.controller.abort(new Error(reason));
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
      await held.provisioned?.dispose().catch((error: unknown) => {
        log.warn({ sessionId, err: errorMessage(error) }, "session cleanup failed");
      });
    }
    await this.#end(sessionId, ending).catch((error: unknown) => {
      log.error({ sessionId, err: errorMessage(error) }, "session end could not be recorded");
    });
    await recordSessionEnd(this.#deps, ctx, ending, elapsedMs(started));
  }
}
