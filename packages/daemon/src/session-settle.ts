import {
  evidenceOf,
  fileReport,
  patchTaskArtifacts,
  postAgentMessage,
  recordEvidence,
  transitionTask,
} from "@ho/core";
import {
  type CommitSha,
  type HoReportInput,
  type Project,
  SYSTEM_ACTOR,
  type Task,
} from "@ho/protocol";
import { pushFromVolume } from "./git-bridge.ts";
import { pushMirrorBranch } from "./mirrors.ts";
import { candidateOf, settledTrace } from "./session-candidate.ts";
import { traceFor } from "./session-ids.ts";
import type { Provisioned, SessionContext } from "./session-provision.ts";
import type { Outcome } from "./session-run.ts";
import type { SessionDeps } from "./sessions.ts";
import { elapsedMs } from "./timing.ts";

const summaryOf = (deps: SessionDeps, provisioned: Provisioned, outcome: Outcome): string => {
  const filed = deps.mcp.report(provisioned.mcpToken);
  const reported = outcome.report.trim();
  return filed?.summary ?? (reported !== "" ? outcome.report : (outcome.failure ?? "(no report)"));
};

async function pushBranch(
  deps: SessionDeps,
  ctx: SessionContext,
  project: Project,
  provisioned: Provisioned,
  ref: string,
): Promise<number> {
  const { provider, config, home } = deps;
  const started = Bun.nanoseconds();
  await pushFromVolume(
    provider,
    config,
    provisioned.sourcePath,
    provisioned.volume,
    provisioned.branch,
    ref,
  );
  if (project.repo.kind === "git") {
    await pushMirrorBranch(home, project, provisioned.branch);
  }
  const ms = elapsedMs(started);
  deps.log.debug(
    { sessionId: ctx.session.id, taskId: ctx.task.id, branch: provisioned.branch, ref, ms },
    "branch pushed",
  );
  return ms;
}

const record = (
  deps: SessionDeps,
  ctx: SessionContext,
  artifacts: Task["artifacts"],
): Promise<Task> =>
  deps.office
    .traced(traceFor(ctx))
    .execute(SYSTEM_ACTOR, (m, c) => patchTaskArtifacts(m, ctx.task.id, artifacts, c));

const authorEvidence = (
  deps: SessionDeps,
  ctx: SessionContext,
  filed: HoReportInput | null,
  commit: CommitSha,
): Promise<unknown> => {
  const { mandateId } = ctx.task;
  const count = ctx.task.spec?.acceptanceCriteria.length ?? 0;
  const claims = (filed?.criteria ?? []).filter((claim) => claim.index <= count);
  if (mandateId === undefined || claims.length === 0) {
    return Promise.resolve();
  }
  const actor = { kind: "agent", agentId: ctx.agent.id } as const;
  return deps.office
    .execute(actor, (m, c) =>
      recordEvidence(
        m,
        mandateId,
        claims.map((claim) =>
          evidenceOf(c, {
            sessionId: ctx.session.id,
            taskId: ctx.task.id,
            commit,
            criterion: claim.index - 1,
            method: "author",
            verdict: "pass",
            proof: claim.how,
          }),
        ),
        c,
      ),
    )
    .catch(() => null);
};

async function pushProgress(
  deps: SessionDeps,
  ctx: SessionContext,
  project: Project,
  provisioned: Provisioned,
  status: Task["status"],
): Promise<void> {
  const pushMs = await pushBranch(deps, ctx, project, provisioned, "HEAD");
  await record(deps, ctx, { branch: provisioned.branch });
  settledTrace(deps, ctx, { status, branch: provisioned.branch, prUrl: null, pushMs });
}

async function settleWork(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  outcome: Outcome,
  current: Task,
): Promise<void> {
  const { mcp, log } = deps;
  const office = deps.office.traced(traceFor(ctx));
  const project = office.model.projects.get(ctx.project.id) ?? ctx.project;
  const actor = { kind: "agent", agentId: ctx.agent.id } as const;
  if (current.status !== "in_progress") {
    await pushProgress(deps, ctx, project, provisioned, current.status);
    return;
  }
  const filed = mcp.report(provisioned.mcpToken);
  const summary = summaryOf(deps, provisioned, outcome);
  const blocked = outcome.failure !== null || filed?.status === "blocked";
  if (blocked) {
    const pushMs = await pushBranch(deps, ctx, project, provisioned, "HEAD");
    await record(deps, ctx, { branch: provisioned.branch, report: summary });
    if (office.model.tasks.get(ctx.task.id)?.status === "in_progress") {
      await office.execute(actor, (m, c) =>
        fileReport(m, ctx.task.id, { status: "blocked", summary }, c),
      );
    }
    settledTrace(deps, ctx, { status: "blocked", branch: provisioned.branch, prUrl: null, pushMs });
    return;
  }
  const candidate = await candidateOf(deps, ctx, project, provisioned);
  if (candidate === null) {
    return;
  }
  await authorEvidence(deps, ctx, filed, candidate.sha);
  const pushMs = await pushBranch(deps, ctx, project, provisioned, candidate.sha);
  await record(deps, ctx, { branch: provisioned.branch, commit: candidate.sha, report: summary });
  if (office.model.tasks.get(ctx.task.id)?.status === "in_progress") {
    await office.execute(actor, (m, c) =>
      fileReport(m, ctx.task.id, { status: "review", summary }, c),
    );
  }
  const settled = {
    status: office.model.tasks.get(ctx.task.id)?.status ?? "review",
    branch: provisioned.branch,
    commit: candidate.sha,
    pushMs,
  };
  log.info({ sessionId: ctx.session.id, taskId: ctx.task.id, ...settled }, "work settled");
  settledTrace(deps, ctx, settled);
}

export async function settle(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  outcome: Outcome,
): Promise<void> {
  const { mcp } = deps;
  const office = deps.office.traced(traceFor(ctx));
  const actor = { kind: "agent", agentId: ctx.agent.id } as const;
  const current = office.model.tasks.get(ctx.task.id);
  if (current === undefined) {
    return;
  }
  const filed = mcp.report(provisioned.mcpToken);
  const summary = summaryOf(deps, provisioned, outcome);
  const blocked = outcome.failure !== null || filed?.status === "blocked";
  deps.log.debug(
    {
      sessionId: ctx.session.id,
      taskId: ctx.task.id,
      mode: ctx.session.mode,
      status: current.status,
      blocked,
      filed: filed?.status ?? null,
      failure: outcome.failure,
    },
    "settling the session",
  );
  switch (ctx.session.mode) {
    case "review": {
      if (current.status === "review" && current.reviewerId === ctx.agent.id) {
        await office.execute(SYSTEM_ACTOR, (m, c) =>
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
    case "verify": {
      if (current.status === "in_progress") {
        await office.execute(SYSTEM_ACTOR, (m, c) =>
          transitionTask(
            m,
            {
              id: ctx.task.id,
              to: "blocked",
              reason: `verification ended without a verdict: ${summary.slice(0, 1800)}`,
            },
            c,
          ),
        );
      }
      return;
    }
    case "triage":
    case "plan": {
      const bossWillReadItOut = blocked && filed === null;
      if (
        !bossWillReadItOut &&
        outcome.report.trim() !== "" &&
        !mcp.replied(provisioned.mcpToken) &&
        !mcp.delegated(provisioned.mcpToken)
      ) {
        await office
          .execute(actor, (m, c) =>
            postAgentMessage(m, ctx.agent.id, outcome.report, ctx.task.id, c),
          )
          .catch(() => null);
      }
      if (current.status === "in_progress") {
        await office.execute(actor, (m, c) =>
          fileReport(m, ctx.task.id, { status: blocked ? "blocked" : "done", summary }, c),
        );
      }
      return;
    }
    case "work": {
      await settleWork(deps, ctx, provisioned, outcome, current);
    }
  }
}
