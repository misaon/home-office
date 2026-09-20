import { fileReport, patchTaskArtifacts, postAgentMessage, transitionTask } from "@ho/core";
import { type Project, SYSTEM_ACTOR, type Task } from "@ho/protocol";
import { pushFromVolume } from "./git-bridge.ts";
import { pushLocalBranch, pushMirrorBranch } from "./mirrors.ts";
import { openPullRequest } from "./publish.ts";
import { candidateOf, settledTrace } from "./session-candidate.ts";
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

async function pullRequest(
  ctx: SessionContext,
  project: Project,
  provisioned: Provisioned,
  report: string,
): Promise<string | null> {
  if ((ctx.task.publish ?? project.publish.mode) !== "pull-request") {
    return null;
  }
  if (project.repo.kind === "local") {
    await pushLocalBranch(project.repo.path, provisioned.branch);
  }
  return openPullRequest(project, ctx.task, provisioned.branch, report);
}

const record = (
  deps: SessionDeps,
  ctx: SessionContext,
  artifacts: Task["artifacts"],
): Promise<Task> =>
  deps.office.execute(SYSTEM_ACTOR, (m, c) => patchTaskArtifacts(m, ctx.task.id, artifacts, c));

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
  const { office, mcp, log } = deps;
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
  const pushMs = await pushBranch(deps, ctx, project, provisioned, candidate.sha);
  const prStarted = Bun.nanoseconds();
  const prUrl = await pullRequest(ctx, project, provisioned, summary);
  const prMs = prUrl === null ? 0 : elapsedMs(prStarted);
  await record(deps, ctx, {
    branch: provisioned.branch,
    commit: candidate.sha,
    report: summary,
    ...(prUrl === null ? {} : { prUrl }),
  });
  if (office.model.tasks.get(ctx.task.id)?.status === "in_progress") {
    await office.execute(actor, (m, c) =>
      fileReport(m, ctx.task.id, { status: "review", summary }, c),
    );
  }
  const settled = {
    status: office.model.tasks.get(ctx.task.id)?.status ?? "review",
    branch: provisioned.branch,
    commit: candidate.sha,
    prUrl,
    pushMs,
    prMs,
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
  const { office, mcp } = deps;
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
    case "triage":
    case "plan": {
      const bossWillReadItOut = blocked && filed === null;
      if (
        !bossWillReadItOut &&
        outcome.report.trim() !== "" &&
        !mcp.replied(provisioned.mcpToken)
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
