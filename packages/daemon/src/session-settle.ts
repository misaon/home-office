import {
  fileReport,
  patchTaskArtifacts,
  postAgentMessage,
  recordVerificationFailure,
  transitionTask,
  verifyAttempts,
} from "@ho/core";
import { type Project, SYSTEM_ACTOR, type Task } from "@ho/protocol";
import { pushFromVolume } from "./git-bridge.ts";
import { pushLocalBranch, pushMirrorBranch } from "./mirrors.ts";
import { openPullRequest } from "./publish.ts";
import type { Provisioned, SessionContext } from "./session-provision.ts";
import type { Outcome } from "./session-run.ts";
import type { SessionDeps } from "./sessions.ts";
import { elapsedMs } from "./timing.ts";
import { runVerify, type VerifyResult } from "./verify.ts";

const OUTPUT_LOG_CHARS = 2000;

async function verified(
  deps: SessionDeps,
  ctx: SessionContext,
  project: Project,
  provisioned: Provisioned,
): Promise<boolean> {
  if (project.verify.command === "") {
    return true;
  }
  const attempt = verifyAttempts(ctx.task) + 1;
  const result: VerifyResult = await runVerify(
    deps.provider,
    deps.config,
    project,
    provisioned.volume,
  ).catch((error: unknown) => ({
    ok: false,
    exitCode: null,
    output: `the checks could not be run: ${String(error)}`,
    ms: 0,
  }));
  const facts = {
    sessionId: ctx.session.id,
    taskId: ctx.task.id,
    command: project.verify.command,
    ok: result.ok,
    exitCode: result.exitCode,
    ms: result.ms,
    attempt,
  };
  deps.traces.write(ctx.session.id, { kind: "verify", ...facts }, true);
  if (result.ok) {
    deps.log.info(facts, "checks passed");
    return true;
  }
  deps.log.warn({ ...facts, output: result.output.slice(-OUTPUT_LOG_CHARS) }, "checks failed");
  await deps.office.execute(SYSTEM_ACTOR, (m, c) =>
    recordVerificationFailure(
      m,
      ctx.task.id,
      {
        command: project.verify.command,
        output: result.output,
        maxAttempts: project.verify.maxAttempts,
      },
      c,
    ),
  );
  return false;
}

async function pushBranch(
  deps: SessionDeps,
  ctx: SessionContext,
  project: Project,
  provisioned: Provisioned,
): Promise<number> {
  const { provider, config, home } = deps;
  const started = Bun.nanoseconds();
  await pushFromVolume(
    provider,
    config,
    provisioned.sourcePath,
    provisioned.volume,
    provisioned.branch,
  );
  if (project.repo.kind === "git") {
    await pushMirrorBranch(home, project, provisioned.branch);
  }
  const ms = elapsedMs(started);
  deps.log.debug(
    { sessionId: ctx.session.id, taskId: ctx.task.id, branch: provisioned.branch, ms },
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

async function settleWork(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  outcome: Outcome,
  current: Task,
): Promise<void> {
  const { office, mcp, log, traces } = deps;
  const project = office.model.projects.get(ctx.project.id) ?? ctx.project;
  const actor = { kind: "agent", agentId: ctx.agent.id } as const;
  const record = (artifacts: Task["artifacts"]): Promise<Task> =>
    office.execute(SYSTEM_ACTOR, (m, c) => patchTaskArtifacts(m, ctx.task.id, artifacts, c));
  if (current.status !== "in_progress") {
    const pushMs = await pushBranch(deps, ctx, project, provisioned);
    await record({ branch: provisioned.branch });
    traces.write(
      ctx.session.id,
      { kind: "settled", status: current.status, branch: provisioned.branch, prUrl: null, pushMs },
      true,
    );
    return;
  }
  const filed = mcp.report(provisioned.mcpToken);
  const reported = outcome.report.trim();
  const summary =
    filed?.summary ?? (reported !== "" ? outcome.report : (outcome.failure ?? "(no report)"));
  const status =
    outcome.failure !== null || filed?.status === "blocked"
      ? "blocked"
      : (filed?.status ?? "review");
  if (status !== "blocked" && !(await verified(deps, ctx, project, provisioned))) {
    traces.write(
      ctx.session.id,
      { kind: "settled", status: "checks_failed", branch: provisioned.branch, prUrl: null },
      true,
    );
    return;
  }
  const pushMs = await pushBranch(deps, ctx, project, provisioned);
  const prStarted = Bun.nanoseconds();
  const prUrl = status === "blocked" ? null : await pullRequest(ctx, project, provisioned, summary);
  const prMs = prUrl === null ? 0 : elapsedMs(prStarted);
  await record({
    branch: provisioned.branch,
    report: summary,
    ...(prUrl === null ? {} : { prUrl }),
  });
  if (office.model.tasks.get(ctx.task.id)?.status === "in_progress") {
    await office.execute(actor, (m, c) => fileReport(m, ctx.task.id, { status, summary }, c));
  }
  const settled = { status, branch: provisioned.branch, prUrl, pushMs, prMs };
  log.info({ sessionId: ctx.session.id, taskId: ctx.task.id, ...settled }, "work settled");
  traces.write(ctx.session.id, { kind: "settled", ...settled }, true);
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
  const reported = outcome.report.trim();
  const summary =
    filed?.summary ?? (reported !== "" ? outcome.report : (outcome.failure ?? "(no report)"));
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
    case "triage": {
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
