import { annotateTask } from "@ho/core";
import { type Agent, type Project, type Session, SYSTEM_ACTOR, type Task } from "@ho/protocol";
import type { Provisioned, SessionContext } from "./session-provision.ts";
import type { Ending } from "./session-run.ts";
import type { SessionDeps } from "./sessions.ts";
import type { TraceCounters } from "./traces.ts";
import { VERSION } from "./version.ts";

const sum = (counts: Readonly<Record<string, number>>): number =>
  Object.values(counts).reduce((total, count) => total + count, 0);

export const traceHeader = (
  session: Session,
  task: Task,
  agent: Agent,
  project: Project,
  previous: Session | undefined,
): Record<string, unknown> => ({
  sessionId: session.id,
  taskId: task.id,
  agentId: agent.id,
  agent: agent.name,
  projectId: project.id,
  project: project.name,
  mode: session.mode,
  provider: agent.provider,
  model: agent.model,
  effort: agent.effort,
  budgets: agent.budgets,
  skillPack: agent.skillPack,
  resumedFrom: previous?.id ?? null,
  startedAt: session.startedAt,
  daemon: VERSION,
  task: {
    title: task.title,
    brief: task.brief,
    spec: task.spec ?? null,
    status: task.status,
    priority: task.priority,
    publish: task.publish ?? null,
    browser: task.browser ?? false,
    source: task.source,
    reviewRounds: task.reviewRounds,
    notes: task.notes.length,
  },
});

export async function recordSessionEnd(
  deps: SessionDeps,
  ctx: SessionContext,
  ending: Ending,
  durationMs: number,
): Promise<void> {
  const { office, log, traces } = deps;
  const sessionId = ctx.session.id;
  const stored = office.model.sessions.get(sessionId);
  const counters: TraceCounters | null = await traces
    .close(sessionId, {
      state: ending.state,
      reason: ending.reason ?? null,
      endedAt: stored?.endedAt ?? null,
      durationMs,
      usage: stored?.usage ?? null,
      taskStatus: office.model.tasks.get(ctx.task.id)?.status ?? null,
    })
    .catch((error: unknown) => {
      log.warn({ sessionId, err: String(error) }, "trace could not be closed");
      return null;
    });
  log.info(
    {
      sessionId,
      taskId: ctx.task.id,
      agent: ctx.agent.name,
      mode: ctx.session.mode,
      state: ending.state,
      reason: ending.reason,
      durationMs,
      usage: stored?.usage,
      toolCalls: counters === null ? undefined : sum(counters.toolCalls),
      toolErrors: counters?.toolErrors,
      mcpRejections: counters?.mcpRejections,
      trace: counters === null ? undefined : traces.pathOf(sessionId),
    },
    "session ended",
  );
}

export async function explainExit(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  failure: string | null,
): Promise<void> {
  const sandbox = await deps.provider.inspect(provisioned.sandbox).catch(() => null);
  deps.log.warn(
    {
      sessionId: ctx.session.id,
      taskId: ctx.task.id,
      failure,
      sandbox,
      memoryMb: deps.config.limits.memoryMb,
    },
    "the agent process exited before it finished",
  );
  deps.traces.write(ctx.session.id, { kind: "process_exit", failure, sandbox }, true);
  if (sandbox?.oomKilled === true) {
    await deps.office
      .execute(SYSTEM_ACTOR, (m, c) =>
        annotateTask(
          m,
          ctx.task.id,
          {
            kind: "info",
            text: `the agent process ran out of memory at the ${String(deps.config.limits.memoryMb)} MiB the sandbox allows; raise limits.memoryMb in the daemon configuration or split the task`,
          },
          c,
        ),
      )
      .catch(() => null);
  }
}
