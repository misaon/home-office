import {
  changeMandateStatus,
  evidenceOf,
  patchMandateArtifacts,
  recordBaseline,
  recordEvidence,
  type SandboxProvider,
} from "@ho/core";
import {
  clip,
  errorMessage,
  type Mandate,
  type MandateStatus,
  type Project,
  SYSTEM_ACTOR,
  type Task,
} from "@ho/protocol";
import { runBaseline } from "./baseline.ts";
import type { DaemonConfig } from "./config.ts";
import type { Logger } from "./logger.ts";
import { integrateMandate } from "./mandate-integrate.ts";
import { conflictReason, pullRequestBody } from "./mandate-report.ts";
import { pushLocalBranch } from "./mirrors.ts";
import type { Office } from "./office.ts";
import { openPullRequest } from "./publish.ts";

export type StewardDeps = {
  office: Office;
  provider: SandboxProvider;
  config: DaemonConfig;
  home: string;
  log: Logger;
};

const REASON_MAX = 2000;

export const setMandateStatus = (
  deps: StewardDeps,
  mandate: Mandate,
  to: MandateStatus,
  reason: string,
): Promise<unknown> =>
  deps.office.execute(SYSTEM_ACTOR, (m, c) =>
    changeMandateStatus(m, mandate.id, to, clip(reason, REASON_MAX), c),
  );

export async function recordBaselineFor(
  deps: StewardDeps,
  mandate: Mandate,
  project: Project,
): Promise<void> {
  const { office, provider, config, home, log } = deps;
  const started = Bun.nanoseconds();
  try {
    const baseline = await runBaseline(provider, config, home, project, mandate, () =>
      office.clock.now().toISOString(),
    );
    await office.execute(SYSTEM_ACTOR, (m, c) => recordBaseline(m, mandate.id, baseline, c));
    log.info(
      {
        mandateId: mandate.id,
        commit: baseline.commit,
        setup: baseline.setup.ok,
        checks: baseline.checks.map((check) => ({ name: check.name, ok: check.ok, ms: check.ms })),
        ms: Math.round((Bun.nanoseconds() - started) / 1e6),
      },
      "baseline recorded",
    );
  } catch (error) {
    log.warn(
      { mandateId: mandate.id, err: errorMessage(error) },
      "the baseline could not be recorded; the request continues without it",
    );
  }
}

export type IntegrationOutcome =
  | { kind: "recorded" }
  | { kind: "conflict"; reason: string }
  | { kind: "failed"; reason: string };

export async function integrate(
  deps: StewardDeps,
  mandate: Mandate,
  project: Project,
  done: readonly Task[],
): Promise<IntegrationOutcome> {
  const { office, provider, config, home, log } = deps;
  log.info({ mandateId: mandate.id, tasks: done.length }, "integrating the request");
  let outcome;
  try {
    outcome = await integrateMandate(provider, config, home, project, mandate, done);
  } catch (error) {
    return { kind: "failed", reason: `the tasks could not be integrated: ${errorMessage(error)}` };
  }
  if (outcome.kind === "conflict") {
    return { kind: "conflict", reason: conflictReason(outcome.task, outcome.output) };
  }
  const { branch, commit, merged, checks } = outcome;
  await office.execute(SYSTEM_ACTOR, (m, c) =>
    patchMandateArtifacts(m, mandate.id, { branch, commit, merged }, c),
  );
  if (checks !== null) {
    const seconds = String(Math.round(checks.ms / 1000));
    await office.execute(SYSTEM_ACTOR, (m, c) =>
      recordEvidence(
        m,
        mandate.id,
        [
          evidenceOf(c, {
            commit,
            criterion: null,
            method: "checks",
            verdict: checks.ok ? "pass" : "fail",
            proof: checks.ok
              ? `\`${checks.command}\` passed on the integrated commit in ${seconds} s`
              : `\`${checks.command}\` failed on the integrated commit:\n${checks.output}`,
          }),
        ],
        c,
      ),
    );
  }
  log.info(
    { mandateId: mandate.id, branch, commit, merged: merged.length, checks: checks?.ok ?? null },
    "request integrated",
  );
  return { kind: "recorded" };
}

export async function fulfil(
  deps: StewardDeps,
  mandate: Mandate,
  project: Project,
  tasks: readonly Task[],
): Promise<void> {
  const { office, log } = deps;
  const { branch } = mandate.artifacts;
  const wantsPullRequest =
    project.publish.mode === "pull-request" ||
    tasks.some((task) => task.publish === "pull-request");
  if (branch !== undefined && wantsPullRequest && mandate.artifacts.prUrl === undefined) {
    try {
      if (project.repo.kind === "local") {
        await pushLocalBranch(project.repo.path, branch);
      }
      const prUrl = await openPullRequest(
        project,
        { title: mandate.title, body: pullRequestBody(office.model, mandate, tasks) },
        branch,
      );
      if (prUrl !== null) {
        await office.execute(SYSTEM_ACTOR, (m, c) =>
          patchMandateArtifacts(m, mandate.id, { prUrl }, c),
        );
      }
    } catch (error) {
      log.warn(
        { mandateId: mandate.id, err: errorMessage(error) },
        "the pull request could not be opened",
      );
    }
  }
  await setMandateStatus(
    deps,
    mandate,
    "fulfilled",
    "every condition holds on the integrated result",
  );
}
