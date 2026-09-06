import {
  type AgentRuntime,
  changeSessionState,
  createChannel,
  endSession,
  isSessionActive,
  recordSessionUsage,
  type RuntimeEvent,
  type SandboxProvider,
  type SecretStore,
  setTaskArtifacts,
  startSession,
  transitionTask,
} from "@ho/core";
import type {
  LiveEvent,
  Session,
  SessionId,
  SessionState,
  TaskArtifacts,
  TaskId,
} from "@ho/protocol";
import type { DaemonConfig } from "./config.ts";
import type { Logger } from "./logger.ts";
import type { Office } from "./office.ts";
import type { RunnerGateway } from "./runner-gateway.ts";
import {
  consume,
  OAUTH_SECRET,
  openRuntime,
  type Outcome,
  provision,
  type Provisioned,
  publish,
  type SessionContext,
} from "./session-run.ts";

const SYSTEM = { kind: "system" } as const;

export type SessionDeps = {
  office: Office;
  provider: SandboxProvider;
  runtime: AgentRuntime;
  gateway: RunnerGateway;
  secrets: SecretStore;
  config: DaemonConfig;
  home: string;
  readonly gatewayUrl: string;
  log: Logger;
};

type Subscriber = { sessionId: SessionId | null; push: (event: LiveEvent) => void };

/** Runs sessions end to end: sandbox, git-bridge, runtime, live fan-out, persisted outcomes. */
export class SessionManager {
  readonly #deps: SessionDeps;
  readonly #subscribers = new Set<Subscriber>();
  readonly #running = new Map<SessionId, AbortController>();

  constructor(deps: SessionDeps) {
    this.#deps = deps;
  }

  get activeCount(): number {
    return [...this.#deps.office.model.sessions.values()].filter((s) => isSessionActive(s.state))
      .length;
  }

  /** Live runtime events for the UI and CLI. Not persisted. */
  stream(sessionId: SessionId | null, signal?: AbortSignal): AsyncIterable<LiveEvent> {
    const channel = createChannel<LiveEvent>(signal);
    const subscriber: Subscriber = { sessionId, push: channel.push };
    this.#subscribers.add(subscriber);
    signal?.addEventListener("abort", () => {
      this.#subscribers.delete(subscriber);
    });
    return channel.iterate();
  }

  async start(taskId: TaskId): Promise<Session> {
    const { office } = this.#deps;
    const task = office.model.tasks.get(taskId);
    const agent =
      task?.assigneeId === undefined ? undefined : office.model.agents.get(task.assigneeId);
    const project = task === undefined ? undefined : office.model.projects.get(task.projectId);
    if (task === undefined || agent === undefined || project === undefined) {
      throw new Error(
        `cannot start a session for task ${taskId}: task, assignee or project missing`,
      );
    }
    const session = await office.execute(SYSTEM, (m, ctx) =>
      startSession(m, { taskId, agentId: agent.id }, ctx),
    );
    const controller = new AbortController();
    this.#running.set(session.id, controller);
    void this.#run({ session, task, agent, project, signal: controller.signal }).finally(() => {
      this.#running.delete(session.id);
    });
    return session;
  }

  async stopAll(): Promise<void> {
    const ids = [...this.#running.keys()];
    for (const controller of this.#running.values()) {
      controller.abort();
    }
    await Promise.all(
      ids.map((id) => this.#end(id, "stopped", "daemon shutdown").catch(() => null)),
    );
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
      endSession(m, { sessionId, state, ...(reason === undefined ? {} : { reason }) }, ctx),
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
        reason: `rate limited until ${event.retryAt ?? "unknown"}`,
      });
    } else if (event.kind === "result" && event.runtimeSessionId !== null) {
      await this.#state(ctx.session.id, "running", { runtimeSessionId: event.runtimeSessionId });
    }
  }

  /** Records artifacts and moves the task on: `review` after success, `blocked` with the reason otherwise. */
  async #settle(ctx: SessionContext, provisioned: Provisioned, outcome: Outcome): Promise<void> {
    const { office } = this.#deps;
    const taskId = ctx.task.id;
    const artifacts: TaskArtifacts =
      outcome.failure === null
        ? await publish(this.#deps, ctx, provisioned, outcome.report)
        : { branch: provisioned.branch, report: outcome.report };
    await office.execute(SYSTEM, (m, c) => setTaskArtifacts(m, { id: taskId, artifacts }, c));
    if (outcome.failure === null) {
      await office.execute(SYSTEM, (m, c) =>
        transitionTask(m, { id: taskId, to: "review", reason: "session finished" }, c),
      );
      await this.#end(ctx.session.id, "stopped");
    } else {
      await office.execute(SYSTEM, (m, c) =>
        transitionTask(m, { id: taskId, to: "blocked", reason: outcome.failure ?? undefined }, c),
      );
      await this.#end(ctx.session.id, "failed", outcome.failure);
    }
  }

  async #run(ctx: SessionContext): Promise<void> {
    const { office, provider, secrets, log } = this.#deps;
    const sessionId = ctx.session.id;
    let provisioned: Provisioned | null = null;
    try {
      const token = await secrets.get(OAUTH_SECRET);
      if (token === null) {
        throw new Error(
          `secret "${OAUTH_SECRET}" is missing; store the output of \`claude setup-token\` first`,
        );
      }
      provisioned = await provision(this.#deps, ctx);
      await this.#state(sessionId, "starting", { sandboxId: provisioned.sandbox.id });
      log.info(
        {
          sessionId,
          uid: provisioned.connection.hello.uid,
          bun: provisioned.connection.hello.bunVersion,
        },
        "runner connected",
      );
      const runtimeSession = await openRuntime(this.#deps, ctx, provisioned, token);
      await this.#state(sessionId, "running");
      const outcome = await consume(runtimeSession, ctx, (event) => this.#onEvent(ctx, event));
      await this.#state(sessionId, "stopping");
      await runtimeSession.close();
      provisioned.connection.close();
      await this.#settle(ctx, provisioned, outcome);
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
      log.error({ sessionId, err: message }, "session failed");
      this.#emit(sessionId, { kind: "error", code: "unknown", message });
      if (office.model.tasks.get(ctx.task.id)?.status === "in_progress") {
        await office
          .execute(SYSTEM, (m, c) =>
            transitionTask(m, { id: ctx.task.id, to: "blocked", reason: message }, c),
          )
          .catch(() => null);
      }
      await this.#end(sessionId, "failed", message).catch(() => null);
    } finally {
      if (provisioned !== null) {
        await provider.stop(provisioned.sandbox, 5).catch(() => null);
        await provider.remove(provisioned.sandbox).catch(() => null);
      }
    }
  }
}
