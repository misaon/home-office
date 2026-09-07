import { fileReport, postAgentMessage, setTaskArtifacts, transitionTask } from "@ho/core";
import type { TaskArtifacts } from "@ho/protocol";
import { type Outcome, type Provisioned, publish, type SessionContext } from "./session-run.ts";
import type { SessionDeps } from "./sessions.ts";

const SYSTEM = { kind: "system" } as const;
const REPORT_MAX = 1500;

/**
 * Closes the loop after the prompt ended. Tools may already have moved the task (report, verdict, handoff,
 * question); only when they did not does the outcome text stand in for the missing report.
 */
export async function settle(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  outcome: Outcome,
): Promise<void> {
  const { office, mcp, log } = deps;
  const actor = { kind: "agent", agentId: ctx.agent.id } as const;
  const current = office.model.tasks.get(ctx.task.id);
  if (current === undefined) {
    return;
  }
  const summary = outcome.report.trim() === "" ? "(no report)" : outcome.report;
  const failure = outcome.failure;

  if (ctx.session.mode === "review") {
    if (current.status === "review" && current.reviewerId === ctx.agent.id) {
      await office.execute(SYSTEM, (m, c) =>
        transitionTask(
          m,
          {
            id: ctx.task.id,
            to: "blocked",
            reason: `review ended without a verdict: ${summary.slice(0, 1800)}`,
          },
          c,
        ),
      );
    }
    return;
  }

  if (ctx.session.mode === "triage") {
    if (outcome.report.trim() !== "" && !mcp.replied(provisioned.mcpToken)) {
      await office
        .execute(actor, (m, c) => postAgentMessage(m, ctx.agent.id, outcome.report, ctx.task.id, c))
        .catch(() => null);
    }
    if (current.status === "in_progress") {
      await office.execute(actor, (m, c) =>
        fileReport(
          m,
          ctx.task.id,
          { status: failure === null ? "done" : "blocked", summary: summary.slice(0, REPORT_MAX) },
          c,
        ),
      );
    }
    return;
  }

  // work: publish whatever was committed, then report on the agent's behalf if it did not.
  let artifacts: TaskArtifacts = { branch: provisioned.branch, report: summary.slice(0, 4000) };
  try {
    artifacts = {
      ...artifacts,
      ...(await publish(deps, ctx, provisioned, summary.slice(0, 4000))),
    };
  } catch (error) {
    log.warn(
      { taskId: ctx.task.id, err: error instanceof Error ? error.message : String(error) },
      "publish failed",
    );
  }
  const existing = office.model.tasks.get(ctx.task.id)?.artifacts;
  await office.execute(SYSTEM, (m, c) =>
    setTaskArtifacts(m, { id: ctx.task.id, artifacts: { ...existing, ...artifacts } }, c),
  );
  if (current.status === "in_progress") {
    await office.execute(actor, (m, c) =>
      fileReport(
        m,
        ctx.task.id,
        { status: failure === null ? "review" : "blocked", summary: summary.slice(0, REPORT_MAX) },
        c,
      ),
    );
  }
}
