import {
  fileReport,
  patchTaskArtifacts,
  postAgentMessage,
  recordVerificationFailure,
  transitionTask,
} from "@ho/core";
import { SYSTEM_ACTOR, type Task } from "@ho/protocol";
import { pushFromVolume } from "./git-bridge.ts";
import { pushLocalBranch, pushMirrorBranch } from "./mirrors.ts";
import { openPullRequest } from "./publish.ts";
import type { Provisioned, SessionContext } from "./session-provision.ts";
import type { Outcome } from "./session-run.ts";
import type { SessionDeps } from "./sessions.ts";
import { runVerify } from "./verify.ts";

async function verified(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
): Promise<boolean> {
  const project = deps.office.model.projects.get(ctx.project.id) ?? ctx.project;
  if (project.verify.command === "") {
    return true;
  }
  const result = await runVerify(deps.provider, deps.config, project, provisioned.volume).catch(
    (error: unknown) => ({ ok: false, output: `the checks could not be run: ${String(error)}` }),
  );
  if (result.ok) {
    deps.log.info({ taskId: ctx.task.id }, "checks passed");
    return true;
  }
  deps.log.warn({ taskId: ctx.task.id, command: project.verify.command }, "checks failed");
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

async function publish(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  report: string,
): Promise<string | null> {
  const { provider, config, home } = deps;
  await pushFromVolume(
    provider,
    config,
    provisioned.sourcePath,
    provisioned.volume,
    provisioned.branch,
  );
  if (ctx.project.repo.kind === "git") {
    await pushMirrorBranch(home, ctx.project, provisioned.branch);
  }
  if (ctx.project.publish.mode !== "pull-request") {
    return null;
  }
  if (ctx.project.repo.kind === "local") {
    await pushLocalBranch(ctx.project.repo.path, provisioned.branch);
  }
  return openPullRequest(ctx.project, ctx.task, provisioned.branch, report);
}

export async function settle(
  deps: SessionDeps,
  ctx: SessionContext,
  provisioned: Provisioned,
  outcome: Outcome,
): Promise<void> {
  const { office, mcp } = deps;
  const actor = { kind: "agent", agentId: ctx.agent.id } as const;
  const taskNow = (): Task | undefined => office.model.tasks.get(ctx.task.id);
  const current = taskNow();
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
      const status = blocked ? "blocked" : (filed?.status ?? "review");
      if (status !== "blocked" && !(await verified(deps, ctx, provisioned))) {
        return;
      }
      const prUrl = await publish(deps, ctx, provisioned, summary);
      await office.execute(SYSTEM_ACTOR, (m, c) =>
        patchTaskArtifacts(
          m,
          ctx.task.id,
          { branch: provisioned.branch, report: summary, ...(prUrl === null ? {} : { prUrl }) },
          c,
        ),
      );
      if (taskNow()?.status === "in_progress") {
        await office.execute(actor, (m, c) => fileReport(m, ctx.task.id, { status, summary }, c));
      }
    }
  }
}
