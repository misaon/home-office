import { type ReadModel, STALLED_TASK_REASON, tasksOfMandate } from "@ho/core";
import {
  clip,
  type Evidence,
  type Mandate,
  type MandateStatus,
  type Project,
  type Task,
} from "@ho/protocol";
import { formatDuration, timingOf } from "./task-timing.ts";
import { bold, type ChecksState, quoteTitle, type Voice } from "./voice.ts";

const REPORT_MAX = 1500;
const LEAD_MAX = 160;
const TASKS_LISTED_MAX = 4;

const quote = (mandate: Mandate): string => quoteTitle(mandate.title);

const verifiedCount = (mandate: Mandate): number =>
  mandate.acceptance.filter((_, index) =>
    mandate.evidence.some(
      (entry) =>
        entry.taskId === undefined &&
        entry.criterion === index &&
        entry.commit === mandate.artifacts.commit &&
        entry.method === "verification" &&
        entry.verdict === "pass",
    ),
  ).length;

const checksState = (mandate: Mandate, project: Project): ChecksState => {
  if (project.verify.command === "") {
    return "none";
  }
  const checks = mandate.evidence.filter(
    (entry) => entry.method === "checks" && entry.commit === mandate.artifacts.commit,
  );
  if (checks.length === 0) {
    return "not_run";
  }
  return checks.every((entry) => entry.verdict === "pass") ? "passed" : "failed";
};

const namesBy = (model: ReadModel, entries: readonly Evidence[]): string[] => {
  const names = new Set<string>();
  for (const entry of entries) {
    if (entry.by.kind !== "agent") {
      continue;
    }
    const agent = model.agents.get(entry.by.agentId) ?? model.formerAgents.get(entry.by.agentId);
    if (agent !== undefined) {
      names.add(agent.name);
    }
  }
  return [...names].map((name) => bold(name));
};

const lead = (report: string): string =>
  report
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("#")) ?? "";

const account = (model: ReadModel, mandate: Mandate): string => {
  const work = tasksOfMandate(model, mandate).filter((task) => task.kind === "work");
  const only = work.length === 1 ? work[0] : undefined;
  if (only !== undefined) {
    return clip(only.artifacts.report ?? "", REPORT_MAX);
  }
  return work
    .slice(0, TASKS_LISTED_MAX)
    .map((task: Task) => {
      const summary = task.artifacts.report === undefined ? "" : lead(task.artifacts.report);
      return `• ${bold(task.title)}${summary === "" ? "" : `: ${clip(summary, LEAD_MAX)}`}`;
    })
    .join("\n");
};

const fulfilledLines = (
  model: ReadModel,
  voice: Voice,
  mandate: Mandate,
  project: Project,
  at: string,
): string => {
  const root = model.tasks.get(mandate.rootTaskId);
  const since = root === undefined ? null : timingOf(model, root, at).sinceRequestMs;
  const spent = tasksOfMandate(model, mandate).reduce(
    (sum, task) => {
      const timing = timingOf(model, task, at);
      return { agentMs: sum.agentMs + timing.agentMs, sessions: sum.sessions + timing.sessions };
    },
    { agentMs: 0, sessions: 0 },
  );
  const { prUrl, branch, commit } = mandate.artifacts;
  const approved = namesBy(
    model,
    mandate.evidence.filter((entry) => entry.method === "review" && entry.verdict === "pass"),
  );
  const verified = namesBy(
    model,
    mandate.evidence.filter(
      (entry) =>
        entry.method === "verification" && entry.verdict === "pass" && entry.commit === commit,
    ),
  );
  const judged = mandate.evidence.filter(
    (entry) =>
      (entry.method === "review" || entry.method === "verification") && entry.verdict === "pass",
  );
  const substitute = judged.length > 0 && judged.every((entry) => entry.fidelity !== "live");
  const report = account(model, mandate);
  return [
    voice.requestDone(quote(mandate), verifiedCount(mandate), mandate.acceptance.length),
    since === null
      ? ""
      : voice.timing(
          formatDuration(since),
          spent.sessions,
          formatDuration(spent.agentMs),
          mandate.round,
        ),
    report === "" ? "" : `\n${report}\n`,
    voice.outcome(checksState(mandate, project), approved, verified, substitute),
    prUrl === undefined ? "" : voice.pullRequest(prUrl),
    branch === undefined ? "" : voice.branch(branch),
  ]
    .filter((line) => line !== "")
    .join("\n");
};

export function mandateStatusLine(
  model: ReadModel,
  voice: Voice,
  mandate: Mandate,
  project: Project,
  to: MandateStatus,
  reason: string | undefined,
  at: string,
): string | null {
  if (to === "verifying") {
    const verifying = tasksOfMandate(model, mandate).findLast((task) => task.kind === "verify");
    const verifier =
      verifying?.assigneeId === undefined ? undefined : model.agents.get(verifying.assigneeId);
    return voice.verifying(
      quote(mandate),
      verifier === undefined ? null : bold(verifier.name),
      mandate.acceptance.length,
    );
  }
  if (to === "fulfilled") {
    return fulfilledLines(model, voice, mandate, project, at);
  }
  if (to === "blocked") {
    return reason?.startsWith(STALLED_TASK_REASON) === true
      ? null
      : voice.mandateBlocked(quote(mandate), reason);
  }
  return null;
}

export const roundLine = (voice: Voice, mandate: Mandate, round: number, reason: string): string =>
  voice.round(round, quote(mandate), reason);
