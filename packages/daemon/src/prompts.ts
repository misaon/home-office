import type { ReadModel } from "@ho/core";
import {
  type Agent,
  type Project,
  ROLE_TITLE,
  type Session,
  type SessionMode,
  type Task,
  type TaskNote,
} from "@ho/protocol";
import { planPrompt } from "./prompts-plan.ts";
import { reviewPrompt } from "./prompts-review.ts";
import type { SessionFacts } from "./prompts-shared.ts";
import { triagePrompt } from "./prompts-triage.ts";
import { workPrompt } from "./prompts-work.ts";

export type { Services } from "./prompts-shared.ts";

const skillsGuide = (agent: Agent): string =>
  agent.provider === "claude-code"
    ? ""
    : "Skills: call ho_list_skills once at the start for the short index of what you know, then ho_get_skill for the one that matches the work, and ho_get_skill_file only where that skill sends you. Do not read them all.";

const whoAmI = (agent: Agent, project: Project): string =>
  agent.role === "boss"
    ? `You are ${agent.name}, the boss of the floor "${project.name}" at Home Office (one floor per project; this floor's repository is "${project.name}").`
    : `You are ${agent.name}, ${ROLE_TITLE[agent.role]} on the floor "${project.name}" at Home Office (one floor per project; this floor's repository is "${project.name}").`;

const common = (agent: Agent, project: Project): string[] => [
  whoAmI(agent, project),
  agent.basePrompt.trim(),
  "Keep tool output small: prefer targeted reads and greps over dumping files. Never print secrets.",
  skillsGuide(agent),
];

const BODY: Readonly<Record<SessionMode, (facts: SessionFacts, model: ReadModel) => string[]>> = {
  work: workPrompt,
  review: reviewPrompt,
  triage: triagePrompt,
  plan: planPrompt,
};

export const systemPrompt = (facts: SessionFacts, model: ReadModel): string =>
  [...common(facts.agent, facts.project), ...BODY[facts.mode](facts, model)]
    .filter((line) => line !== "")
    .join("\n");

const taskBrief = (task: Task): string =>
  task.brief.trim() === "" ? task.title : `${task.title}\n\n${task.brief}`;

const formatNote = (note: TaskNote): string => `- [${note.kind}] ${note.text}`;

const reviewOpening = (task: Task): string => {
  const report = task.notes.findLast((n) => n.kind === "report");
  const verdicts = task.notes.filter(
    (n) => n.kind === "review" && (report === undefined || n.at >= report.at),
  );
  const earlier =
    verdicts.length === 0
      ? ""
      : `\n\nVerdicts before yours in this round:\n${verdicts.map((n) => formatNote(n)).join("\n")}`;
  return `Review request for task "${task.title}".\n\nOriginal brief:\n${task.brief}\n\nAuthor's report:\n${report?.text ?? task.artifacts.report ?? "(none)"}${earlier}`;
};

export const openingMessage = (
  task: Task,
  mode: Session["mode"],
  previous: Session | undefined,
): string => {
  if (mode === "review") {
    return reviewOpening(task);
  }
  if (previous === undefined) {
    return taskBrief(task);
  }
  const since = task.notes.filter((n) => n.at >= previous.startedAt && n.kind !== "report");
  const head = `Continue the task "${task.title}". Your previous session ended; the brief follows, then what happened since.\n\nBrief:\n${task.brief.trim() === "" ? task.title : task.brief}`;
  return since.length === 0
    ? `${head}\n\nPick up where you left off and finish with ho_report.`
    : `${head}\n\nSince your last session:\n${since.map((n) => formatNote(n)).join("\n")}\n\nAddress these, commit, then finish with ho_report.`;
};
