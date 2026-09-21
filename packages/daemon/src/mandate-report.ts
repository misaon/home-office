import type { Assessment, ReadModel, TaskCriteria } from "@ho/core";
import {
  clip,
  type Evidence,
  type EvidenceBlocker,
  type EvidenceFidelity,
  headline,
  type Mandate,
  type Project,
  type Task,
} from "@ho/protocol";

const PROOF_MAX = 300;
const REPORT_MAX = 1200;
const TITLE_MAX = 80;

export const pullRequestTitle = (mandate: Mandate, tasks: readonly Task[]): string => {
  const work = tasks.filter((task) => task.kind === "work");
  const only = work.length === 1 ? work[0] : undefined;
  return only === undefined ? headline(mandate.request, TITLE_MAX) : only.title;
};

type Model = Pick<ReadModel, "agents" | "formerAgents">;

const nameOf = (model: Model, evidence: Evidence): string => {
  if (evidence.by.kind === "agent") {
    const agent =
      model.agents.get(evidence.by.agentId) ?? model.formerAgents.get(evidence.by.agentId);
    return agent?.name ?? "a former colleague";
  }
  return evidence.by.kind === "human" ? "the human" : "the office";
};

const latest = (entries: readonly Evidence[]): Evidence | undefined =>
  entries.toSorted((a, b) => b.at.localeCompare(a.at))[0];

const MARK: Readonly<Record<Evidence["verdict"], string>> = {
  pass: "✅",
  fail: "❌",
  not_checked: "◌",
};

const FIDELITY: Readonly<Record<EvidenceFidelity, string>> = {
  live: "on the running application",
  substitute: "on a substitute page, not the application",
  static: "from code and build output alone",
};

const BLOCKER: Readonly<Record<EvidenceBlocker, string>> = {
  not_prepared: "nothing described how to run it",
  not_attempted: "running it was not attempted",
  attempt_failed: "the attempt to run it failed",
};

const basisOf = (entry: Evidence): string =>
  [
    entry.method,
    FIDELITY[entry.fidelity],
    entry.blocker === undefined ? "" : BLOCKER[entry.blocker],
    entry.via === undefined ? "" : `via \`${entry.via}\``,
  ]
    .filter((part) => part !== "")
    .join(", ");

const filesOf = (entry: Evidence): string =>
  entry.files.length === 0 ? "" : ` [${entry.files.map((file) => file.name).join(", ")}]`;

const criterionRows = (
  model: Model,
  mandate: Mandate,
  task: Task | null,
  texts: readonly string[],
  commit: string | undefined,
): string[] =>
  texts.map((text, index) => {
    const judged = latest(
      mandate.evidence.filter(
        (entry) =>
          entry.criterion === index &&
          (task === null ? entry.taskId === undefined : entry.taskId === task.id) &&
          entry.commit === commit &&
          entry.method !== "author",
      ),
    );
    const verdict =
      judged === undefined ? "◌ unverified" : `${MARK[judged.verdict]} ${judged.verdict}`;
    const by =
      judged === undefined
        ? ""
        : ` — ${nameOf(model, judged)} (${basisOf(judged)}): ${clip(judged.proof, PROOF_MAX)}${filesOf(judged)}`;
    return `${String(index + 1)}. ${text} — ${verdict}${by}`;
  });

const taskSection = (model: Model, mandate: Mandate, task: Task): string => {
  const who = task.assigneeId === undefined ? undefined : model.agents.get(task.assigneeId);
  const head = `### ${task.title}\n\n${who?.name ?? "a former colleague"} · \`${task.artifacts.branch ?? "no branch"}\` at \`${task.artifacts.commit ?? "no commit"}\``;
  const report =
    task.artifacts.report === undefined ? "" : `\n\n${clip(task.artifacts.report, REPORT_MAX)}`;
  const criteria =
    task.spec === undefined
      ? []
      : criterionRows(model, mandate, task, task.spec.acceptanceCriteria, task.artifacts.commit);
  return `${head}${report}${criteria.length === 0 ? "" : `\n\nAcceptance criteria:\n${criteria.join("\n")}`}`;
};

const checksSection = (mandate: Mandate, project: Project): string => {
  if (project.verify.command === "") {
    return "## Checks\n\nNone configured on this floor: nothing ran automatically, so every judgement below is a reviewer's own.";
  }
  const judged = latest(
    mandate.evidence.filter(
      (entry) => entry.method === "checks" && entry.commit === mandate.artifacts.commit,
    ),
  );
  return judged === undefined
    ? `## Checks\n\n\`${project.verify.command}\` is configured but did not run on the integrated commit.`
    : `## Checks\n\n${MARK[judged.verdict]} ${clip(judged.proof, PROOF_MAX)}`;
};

const judgedIndependently = (
  mandate: Mandate,
  taskId: Task["id"] | undefined,
  index: number,
  commit: string | undefined,
): boolean =>
  mandate.evidence.some(
    (entry) =>
      entry.criterion === index &&
      entry.taskId === taskId &&
      entry.commit === commit &&
      entry.method !== "author" &&
      entry.verdict !== "not_checked",
  );

const unverifiedSection = (mandate: Mandate, tasks: readonly Task[]): string => {
  const conditions = mandate.acceptance.flatMap((criterion, index) =>
    judgedIndependently(mandate, undefined, index, mandate.artifacts.commit)
      ? []
      : [`- condition ${String(index + 1)}: ${criterion.text}`],
  );
  const criteria = tasks.flatMap((task) =>
    (task.spec?.acceptanceCriteria ?? []).flatMap((text, index) =>
      judgedIndependently(mandate, task.id, index, task.artifacts.commit)
        ? []
        : [`- "${task.title}", criterion ${String(index + 1)}: ${text}`],
    ),
  );
  const lines = [...conditions, ...criteria];
  return `## Unverified\n\n${lines.length === 0 ? "Nothing: every condition and criterion carries a reviewer's or a verifier's judgement." : lines.join("\n")}`;
};

export const pullRequestBody = (
  model: Model,
  mandate: Mandate,
  tasks: readonly Task[],
  project: Project,
): string =>
  [
    `## Request\n\n${mandate.request}`,
    checksSection(mandate, project),
    mandate.acceptance.length === 0
      ? ""
      : `## Conditions of done\n\n${criterionRows(
          model,
          mandate,
          null,
          mandate.acceptance.map((criterion) => criterion.text),
          mandate.artifacts.commit,
        ).join("\n")}`,
    `## Work\n\n${tasks.map((task) => taskSection(model, mandate, task)).join("\n\n")}`,
    unverifiedSection(mandate, tasks),
    `_Integrated by Home Office at commit \`${mandate.artifacts.commit ?? "?"}\` after ${String(mandate.round)} fix round(s)._`,
  ]
    .filter((part) => part !== "")
    .join("\n\n");

const seen = (model: Model, judged: Evidence | undefined): string =>
  judged === undefined ? "" : `: ${nameOf(model, judged)} saw ${clip(judged.proof, PROOF_MAX)}`;

const failedLines = (model: Model, mandate: Mandate, indexes: readonly number[]): string[] =>
  indexes.map((index) => {
    const judged = latest(
      mandate.evidence.filter(
        (entry) =>
          entry.taskId === undefined && entry.criterion === index && entry.verdict === "fail",
      ),
    );
    const text = mandate.acceptance[index]?.text ?? "(missing)";
    return `- condition ${String(index + 1)} "${text}"${seen(model, judged)}`;
  });

const failedTaskLines = (
  model: Model,
  mandate: Mandate,
  taskCriteria: readonly TaskCriteria[],
): string[] =>
  taskCriteria.flatMap(({ task, indexes }) =>
    indexes.map((index) => {
      const judged = latest(
        mandate.evidence.filter(
          (entry) =>
            entry.taskId === task.id && entry.criterion === index && entry.verdict === "fail",
        ),
      );
      const text = task.spec?.acceptanceCriteria[index] ?? "(missing)";
      return `- task "${task.title}" (${task.id}), criterion ${String(index + 1)} "${text}"${seen(model, judged)}`;
    }),
  );

const checksLine = (mandate: Mandate): string[] => {
  const judged = latest(
    mandate.evidence.filter(
      (entry) =>
        entry.taskId === undefined && entry.criterion === null && entry.method === "checks",
    ),
  );
  return [
    judged === undefined
      ? "- the floor's checks failed on the integrated commit"
      : `- the floor's checks failed on the integrated commit: ${clip(judged.proof, PROOF_MAX)}`,
  ];
};

export const failureReason = (
  model: Model,
  mandate: Mandate,
  assessment: Extract<Assessment, { kind: "failed" }>,
): string =>
  [
    ...failedLines(model, mandate, assessment.criteria),
    ...failedTaskLines(model, mandate, assessment.taskCriteria),
    ...(assessment.checks ? checksLine(mandate) : []),
  ].join("\n");

export const conflictReason = (task: Task, output: string): string =>
  `- the branch of "${task.title}" (${task.id}) does not merge with the other tasks' branches:\n${clip(output, PROOF_MAX)}`;

export const decisionBrief = (mandate: Mandate, tasks: readonly Task[], reason: string): string =>
  [
    `The office reopened the request "${mandate.title}" (fix round ${String(mandate.round)}): every task was done and reviewed, but the integrated result failed verification.`,
    `Request, as the human wrote it:\n${mandate.request}`,
    `What failed:\n${reason}`,
    `Tasks in the result:\n${tasks
      .map((task) => `- ${task.id} "${task.title}" (${task.artifacts.branch ?? "no branch"})`)
      .join("\n")}`,
    "Decide how it continues: ho_delegate a fix to the right colleague — set dependsOn to the task it corrects so the new branch continues from that result; it joins this request by itself — or, when the failure needs a decision only the human can make, ho_report blocked with the question. A fresh ho_plan is for a plan that was wrong, not for a defect.",
  ].join("\n\n");
