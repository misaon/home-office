import {
  annotateTask,
  recordChecksPassed,
  recordVerificationFailure,
  transitionTask,
  verifyAttempts,
} from "@ho/core";
import { type CommitSha, errorMessage, type Project, SYSTEM_ACTOR, type Task } from "@ho/protocol";
import { inspectWorkingTree, type WorkingTree } from "./git-bridge.ts";
import type { Provisioned, SessionContext } from "./session-provision.ts";
import type { SessionDeps } from "./sessions.ts";
import { runVerify, type VerifyResult } from "./verify.ts";

const OUTPUT_LOG_CHARS = 2000;
const DIRTY_LIST_MAX = 20;
const DIRTY_COMMAND = "git status --porcelain";

export const settledTrace = (
  deps: SessionDeps,
  ctx: SessionContext,
  facts: Readonly<Record<string, unknown>>,
): void => {
  deps.traces.write(ctx.session.id, { kind: "settled", ...facts }, true);
};

type Verification =
  | { kind: "passed"; skipped: boolean }
  | { kind: "failed" }
  | { kind: "unavailable"; reason: string };

async function verified(
  deps: SessionDeps,
  ctx: SessionContext,
  project: Project,
  provisioned: Provisioned,
  commit: CommitSha,
): Promise<Verification> {
  const { command } = project.verify;
  if (command === "") {
    deps.traces.write(ctx.session.id, { kind: "verify", skipped: true, commit }, true);
    return { kind: "passed", skipped: true };
  }
  const attempt = verifyAttempts(ctx.task) + 1;
  let result: VerifyResult;
  try {
    result = await runVerify(deps.provider, deps.config, project, provisioned.volume, {
      sessionId: ctx.session.id,
      labels: provisioned.labels,
    });
  } catch (error) {
    const reason = errorMessage(error).slice(0, 500);
    deps.log.error(
      { sessionId: ctx.session.id, taskId: ctx.task.id, command, commit, err: reason },
      "the checks could not be run",
    );
    deps.traces.write(
      ctx.session.id,
      { kind: "verify", command, commit, unavailable: reason },
      true,
    );
    return { kind: "unavailable", reason };
  }
  const facts = {
    sessionId: ctx.session.id,
    taskId: ctx.task.id,
    command,
    commit,
    ok: result.ok,
    exitCode: result.exitCode,
    ms: result.ms,
    attempt,
  };
  deps.traces.write(ctx.session.id, { kind: "verify", ...facts }, true);
  if (result.ok) {
    deps.log.info(facts, "checks passed");
    await deps.office
      .execute(SYSTEM_ACTOR, (m, c) =>
        recordChecksPassed(m, ctx.task.id, { command, commit, ms: result.ms }, c),
      )
      .catch(() => null);
    return { kind: "passed", skipped: false };
  }
  deps.log.warn({ ...facts, output: result.output.slice(-OUTPUT_LOG_CHARS) }, "checks failed");
  await failCheck(deps, ctx, project, {
    command,
    output: `${preexistingNote(deps, ctx, project)}${result.output}`,
    commit,
  });
  return { kind: "failed" };
}

const preexistingNote = (deps: SessionDeps, ctx: SessionContext, project: Project): string => {
  const baseline =
    ctx.task.mandateId === undefined
      ? undefined
      : deps.office.model.mandates.get(ctx.task.mandateId)?.baseline;
  if (baseline === undefined) {
    return "";
  }
  const known = baseline.checks.find((check) => check.name === "verify");
  return known?.ok === false
    ? `(the same check already fails on ${project.defaultBranch} at ${baseline.commit.slice(0, 12)}; compare the output below with that failure before you chase it)\n\n`
    : "";
};

type CheckFailure = { command: string; output: string; commit: CommitSha };

const failCheck = (
  deps: SessionDeps,
  ctx: SessionContext,
  project: Project,
  failure: CheckFailure,
): Promise<Task> =>
  deps.office.execute(SYSTEM_ACTOR, (m, c) =>
    recordVerificationFailure(
      m,
      ctx.task.id,
      { ...failure, maxAttempts: project.verify.maxAttempts },
      c,
    ),
  );

const uncommitted = (
  deps: SessionDeps,
  ctx: SessionContext,
  project: Project,
  tree: WorkingTree,
): Promise<Task> => {
  const shown = tree.dirty.slice(0, DIRTY_LIST_MAX).join("\n");
  const more =
    tree.dirty.length > DIRTY_LIST_MAX
      ? `\n… and ${String(tree.dirty.length - DIRTY_LIST_MAX)} more`
      : "";
  deps.log.warn(
    { sessionId: ctx.session.id, taskId: ctx.task.id, commit: tree.sha, dirty: tree.dirty.length },
    "the working tree has uncommitted changes; nothing is verified or published",
  );
  return failCheck(deps, ctx, project, {
    command: DIRTY_COMMAND,
    output: `The office verifies and publishes commits only, and HEAD ${tree.sha} does not contain everything in the working tree:\n${shown}${more}\n\nCommit what belongs to the task and remove the rest, then report again.`,
    commit: tree.sha,
  });
};

const blockUnavailable = (
  deps: SessionDeps,
  ctx: SessionContext,
  reason: string,
): Promise<unknown> =>
  deps.office
    .execute(SYSTEM_ACTOR, (m, c) =>
      transitionTask(
        m,
        {
          id: ctx.task.id,
          to: "blocked",
          reason: `the checks could not be run: ${reason.slice(0, 1800)}`,
        },
        c,
      ),
    )
    .catch(() => null);

export async function candidateOf(
  deps: SessionDeps,
  ctx: SessionContext,
  project: Project,
  provisioned: Provisioned,
): Promise<WorkingTree | null> {
  let tree: WorkingTree;
  try {
    tree = await inspectWorkingTree(deps.provider, deps.config, provisioned.volume);
  } catch (error) {
    await blockUnavailable(deps, ctx, `the working tree could not be read: ${errorMessage(error)}`);
    return null;
  }
  if (tree.dirty.length > 0) {
    await uncommitted(deps, ctx, project, tree);
    settledTrace(deps, ctx, {
      status: "uncommitted",
      branch: provisioned.branch,
      commit: tree.sha,
    });
    return null;
  }
  await provisioned.stopServices();
  const verification = await verified(deps, ctx, project, provisioned, tree.sha);
  if (verification.kind === "unavailable") {
    await blockUnavailable(deps, ctx, verification.reason);
    return null;
  }
  if (verification.kind === "failed") {
    settledTrace(deps, ctx, {
      status: "checks_failed",
      branch: provisioned.branch,
      commit: tree.sha,
    });
    return null;
  }
  const after = await inspectWorkingTree(deps.provider, deps.config, provisioned.volume).catch(
    () => null,
  );
  if (after !== null && after.sha !== tree.sha) {
    await failCheck(deps, ctx, project, {
      command: project.verify.command,
      output: `the checks moved HEAD from ${tree.sha} to ${after.sha}; a check must not commit`,
      commit: tree.sha,
    });
    return null;
  }
  if (verification.skipped) {
    await deps.office.execute(SYSTEM_ACTOR, (m, c) =>
      annotateTask(
        m,
        ctx.task.id,
        {
          kind: "info",
          text: `no check command on this floor: commit ${tree.sha} is published without the office verifying it`,
          commit: tree.sha,
        },
        c,
      ),
    );
  }
  return tree;
}
