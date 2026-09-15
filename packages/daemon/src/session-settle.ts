import { fileReport, patchTaskArtifacts, postAgentMessage, transitionTask } from "@ho/core";
import { githubRepoFromUrl, type Project, SYSTEM_ACTOR, type Task } from "@ho/protocol";
import { pushFromVolume } from "./git-bridge.ts";
import { mustExec } from "./host-exec.ts";
import { pushLocalBranch, pushMirrorBranch } from "./mirrors.ts";
import type { Provisioned, SessionContext } from "./session-provision.ts";
import type { Outcome } from "./session-run.ts";
import type { SessionDeps } from "./sessions.ts";

const GH_TIMEOUT_MS = 120_000;

const gh = (args: readonly string[], cwd: string | undefined, what: string): Promise<string> =>
  mustExec(["gh", ...args], { cwd, timeoutMs: GH_TIMEOUT_MS }, `gh ${what}`);

/**
 * Opens the project's pull request for a branch (reusing an open one), through the host's `gh`, and
 * returns its URL; null when the project delivers branches only.
 */
async function openPullRequest(
  project: Project,
  task: Task,
  branch: string,
  report: string,
): Promise<string | null> {
  if (project.publish.mode !== "pull-request") {
    return null;
  }
  let cwd: string | undefined;
  const target: string[] = [];
  if (project.repo.kind === "local") {
    await pushLocalBranch(project.repo.path, branch);
    cwd = project.repo.path;
  } else {
    const repo = githubRepoFromUrl(project.repo.url);
    if (repo === null) {
      throw new Error("pull requests need a GitHub URL");
    }
    target.push("--repo", repo);
  }
  const existing = await gh(
    [
      "pr",
      "list",
      ...target,
      "--head",
      branch,
      "--base",
      project.defaultBranch,
      "--state",
      "open",
      "--json",
      "url",
      "--jq",
      ".[0].url // empty",
    ],
    cwd,
    "pr list",
  );
  if (existing !== "") {
    return existing;
  }
  const created = await gh(
    [
      "pr",
      "create",
      "--head",
      branch,
      "--base",
      project.defaultBranch,
      "--title",
      task.title,
      "--body",
      report === "" ? task.brief : report,
      ...(project.publish.draft ? ["--draft"] : []),
      ...target,
    ],
    cwd,
    "pr create",
  );
  return created.split("\n").findLast((line) => line.startsWith("https://")) ?? null;
}

/** Pushes the branch back to the source repository, then (per project policy) opens a pull request. */
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
  return openPullRequest(ctx.project, ctx.task, provisioned.branch, report);
}

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
  const { office, mcp } = deps;
  const actor = { kind: "agent", agentId: ctx.agent.id } as const;
  // Re-read rather than close over: publishing a branch takes minutes, in which a human can cancel or
  // reassign the task, and filing a report against a task that moved on fails the settled session.
  const taskNow = (): Task | undefined => office.model.tasks.get(ctx.task.id);
  const current = taskNow();
  if (current === undefined) {
    return;
  }
  const filed = mcp.report(provisioned.mcpToken);
  const summary = filed?.summary ?? (outcome.report.trim() === "" ? "(no report)" : outcome.report);
  const blocked = outcome.failure !== null || filed?.status === "blocked";
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
      // A triage task that blocks is announced by the boss, and without a filed report the reason he
      // reads out is this very text — so posting it here as well says the same sentence twice. That is
      // what a failed prompt looks like: the runtime's error is both the "report" and the reason.
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
        // What the agent filed through `ho_report` stands; without a report the work goes to review.
        const status = blocked ? "blocked" : (filed?.status ?? "review");
        await office.execute(actor, (m, c) => fileReport(m, ctx.task.id, { status, summary }, c));
      }
    }
  }
}
