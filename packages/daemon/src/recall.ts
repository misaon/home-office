import { type ReadModel, sessionsOfTask } from "@ho/core";
import { reviewVerdictOf, type ProjectId, type Task, type TaskId } from "@ho/protocol";

const K1 = 1.2;
const B = 0.75;
const MIN_TOKEN = 2;
const EXCERPT_CHARS = 400;
const FINDINGS_CHARS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RecallHit = {
  taskId: TaskId;
  title: string;
  status: Task["status"];
  who: string;
  model: string | null;
  verified: "checked" | "unchecked" | "unknown";
  daysAgo: number;
  report: string;
  findings: readonly string[];
};

const tokens = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= MIN_TOKEN);

const reportOf = (task: Task): string =>
  task.notes.findLast((entry) => entry.kind === "report")?.text ?? task.artifacts.report ?? "";

const findingsOf = (task: Task): string[] =>
  task.notes
    .filter((entry) => entry.kind === "review" && reviewVerdictOf(entry.text) !== null)
    .map((entry) => entry.text);

const documentOf = (task: Task): string =>
  [task.title, task.brief, reportOf(task), ...findingsOf(task)].join("\n");

const clip = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;

const ENDED: ReadonlySet<Task["status"]> = new Set(["done", "blocked", "failed", "cancelled"]);

const modelOf = (model: ReadModel, task: Task): string | null => {
  const [last] = sessionsOfTask(model, task.id)
    .filter((session) => session.mode === "work" && session.runtime !== undefined)
    .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt));
  const runtime = last?.runtime;
  return runtime === undefined
    ? null
    : `${runtime.confirmedModel ?? runtime.model}/${runtime.confirmedEffort ?? runtime.effort}`;
};

const verifiedOf = (task: Task): RecallHit["verified"] => {
  if (task.artifacts.commit === undefined) {
    return "unknown";
  }
  return task.notes.some(
    (note) =>
      note.kind === "info" &&
      note.author.kind === "system" &&
      note.commit === task.artifacts.commit &&
      note.text.startsWith("no check command"),
  )
    ? "unchecked"
    : "checked";
};

export function recall(
  model: ReadModel,
  projectId: ProjectId,
  exceptTaskId: TaskId,
  query: string,
  limit: number,
  now: number,
): RecallHit[] {
  const wanted = [...new Set(tokens(query))];
  if (wanted.length === 0) {
    return [];
  }
  const ids = model.tasksByProject.get(projectId) ?? new Set<TaskId>();
  const documents: { task: Task; terms: string[] }[] = [];
  for (const id of ids) {
    const task = model.tasks.get(id);
    if (task === undefined || task.id === exceptTaskId || !ENDED.has(task.status)) {
      continue;
    }
    documents.push({ task, terms: tokens(documentOf(task)) });
  }
  if (documents.length === 0) {
    return [];
  }
  const total = documents.length;
  const averageLength = documents.reduce((sum, d) => sum + d.terms.length, 0) / total;
  const carrying = new Map<string, number>();
  for (const term of wanted) {
    carrying.set(term, documents.filter((d) => d.terms.includes(term)).length);
  }
  const scored = documents.map(({ task, terms }) => {
    let score = 0;
    for (const term of wanted) {
      const frequency = terms.filter((candidate) => candidate === term).length;
      if (frequency === 0) {
        continue;
      }
      const carried = carrying.get(term) ?? 0;
      const idf = Math.log((total - carried + 0.5) / (carried + 0.5) + 1);
      score +=
        (idf * (frequency * (K1 + 1))) /
        (frequency + K1 * (1 - B + (B * terms.length) / averageLength));
    }
    return { task, score };
  });
  return scored
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score || b.task.updatedAt.localeCompare(a.task.updatedAt))
    .slice(0, limit)
    .map(({ task }) => ({
      taskId: task.id,
      title: task.title,
      status: task.status,
      who:
        task.assigneeId === undefined
          ? "unassigned"
          : (model.agents.get(task.assigneeId)?.name ?? "a colleague who has left"),
      model: modelOf(model, task),
      verified: verifiedOf(task),
      daysAgo: Math.max(0, Math.round((now - Date.parse(task.updatedAt)) / DAY_MS)),
      report: clip(reportOf(task), EXCERPT_CHARS),
      findings: findingsOf(task).map((text) => clip(text, FINDINGS_CHARS)),
    }));
}
