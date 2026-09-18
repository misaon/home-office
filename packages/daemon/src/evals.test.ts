import { createReadModel, type ReadModel } from "@ho/core";
import {
  Agent,
  type AgentId,
  formatReviewNote,
  ProjectId,
  Session,
  type SessionId,
  Task,
  type TaskId,
} from "@ho/protocol";
import { expect, test } from "bun:test";
import { scorecard } from "./evals.ts";

const NOW = Date.parse("2026-09-18T12:00:00.000Z");
const PROJECT = ProjectId.parse("01a0bbbb-0000-7000-8000-000000000001");
const at = (hoursAgo: number): string => new Date(NOW - hoursAgo * 3_600_000).toISOString();

const agent = (id: string, name: string, role: string): Agent =>
  Agent.parse({
    id: `01a0aaaa-0000-7000-8000-00000000000${id}`,
    name,
    role,
    appearance: { gender: "neutral" },
    provider: "claude-code",
    model: "sonnet",
    effort: "high",
    budgets: {},
    projectId: PROJECT,
    createdAt: at(100),
    updatedAt: at(100),
  });

const REX = agent("1", "Rex", "backend");
const MARA = agent("2", "Mara", "head");
const IDA = agent("3", "Ida", "frontend");

const task = (
  id: string,
  fields: Partial<{
    status: string;
    assigneeId: AgentId;
    reviewRounds: number;
    rating: { verdict: string; note: string; at: string };
    notes: { at: string; author: unknown; kind: string; text: string }[];
    updatedAt: string;
    title: string;
  }>,
): Task =>
  Task.parse({
    id: `01a0dddd-0000-7000-8000-00000000000${id}`,
    projectId: PROJECT,
    title: fields.title ?? `task ${id}`,
    brief: "",
    status: fields.status ?? "done",
    assigneeId: fields.assigneeId,
    reviewRounds: fields.reviewRounds ?? 0,
    rating: fields.rating,
    notes: fields.notes ?? [],
    source: { kind: "manual" },
    artifacts: {},
    priority: "normal",
    createdAt: at(50),
    updatedAt: fields.updatedAt ?? at(1),
  });

const session = (id: string, taskId: TaskId, agentId: AgentId, minutes: number): Session =>
  Session.parse({
    id: `01a0eeee-0000-7000-8000-00000000000${id}`,
    taskId,
    agentId,
    mode: "work",
    state: "stopped",
    usage: {
      inputTokens: 1000,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      turns: 5,
    },
    startedAt: at(2),
    endedAt: new Date(Date.parse(at(2)) + minutes * 60_000).toISOString(),
  });

const modelWith = (tasks: readonly Task[], sessions: readonly Session[]): ReadModel => {
  const model = createReadModel();
  for (const person of [REX, MARA, IDA]) {
    model.agents.set(person.id, person);
  }
  for (const entry of tasks) {
    model.tasks.set(entry.id, entry);
  }
  for (const entry of sessions) {
    model.sessions.set(entry.id, entry);
    const bucket = model.sessionsByTask.get(entry.taskId) ?? new Set<SessionId>();
    bucket.add(entry.id);
    model.sessionsByTask.set(entry.taskId, bucket);
  }
  return model;
};

const reviewNote = (
  author: Agent,
  verdict: "approve" | "request_changes",
): {
  at: string;
  author: { kind: "agent"; agentId: AgentId };
  kind: "review";
  text: string;
} => ({
  at: at(1),
  author: { kind: "agent", agentId: author.id },
  kind: "review",
  text: formatReviewNote(verdict, "findings"),
});

test("first pass is a finished task nobody sent back", () => {
  const model = modelWith(
    [
      task("1", { assigneeId: REX.id, reviewRounds: 0 }),
      task("2", { assigneeId: REX.id, reviewRounds: 2 }),
    ],
    [],
  );
  const card = scorecard(model, NOW, {});
  expect(card.office.finished).toBe(2);
  expect(card.office.firstPass).toBe(1);
  expect(card.office.reviewRounds).toBe(2);
});

test("blocked and failed are counted apart from finished", () => {
  const model = modelWith(
    [
      task("1", { assigneeId: REX.id, status: "blocked" }),
      task("2", { assigneeId: REX.id, status: "failed" }),
      task("3", { assigneeId: REX.id, status: "done" }),
    ],
    [],
  );
  const card = scorecard(model, NOW, {});
  expect(card.office.blocked).toBe(1);
  expect(card.office.failed).toBe(1);
  expect(card.office.finished).toBe(1);
});

test("tasks go to the assignee and sessions to whoever ran them", () => {
  const first = task("1", { assigneeId: REX.id });
  const model = modelWith(
    [first],
    [session("1", first.id, REX.id, 30), session("2", first.id, MARA.id, 10)],
  );
  const card = scorecard(model, NOW, {});
  const rex = card.agents.find((a) => a.name === "Rex");
  const mara = card.agents.find((a) => a.name === "Mara");
  expect(rex?.finished).toBe(1);
  expect(rex?.sessions).toBe(1);
  expect(rex?.minutes).toBe(30);
  expect(mara?.finished).toBe(0);
  expect(mara?.sessions).toBe(1);
});

test("a reviewer who approved a task the human then called bad has an escape", () => {
  const model = modelWith(
    [
      task("1", {
        assigneeId: IDA.id,
        rating: { verdict: "bad", note: "still broken", at: at(1) },
        notes: [reviewNote(MARA, "approve")],
      }),
      task("2", { assigneeId: IDA.id, notes: [reviewNote(MARA, "request_changes")] }),
    ],
    [],
  );
  const card = scorecard(model, NOW, {});
  const mara = card.reviewers.find((r) => r.name === "Mara");
  expect(mara?.reviewed).toBe(2);
  expect(mara?.approved).toBe(1);
  expect(mara?.requestedChanges).toBe(1);
  expect(mara?.escapes).toBe(1);
});

test("attention lists the worst first and explains why", () => {
  const model = modelWith(
    [
      task("1", { assigneeId: REX.id, status: "done", reviewRounds: 3, title: "reworked" }),
      task("2", { assigneeId: REX.id, status: "failed", title: "broke" }),
      task("3", {
        assigneeId: IDA.id,
        rating: { verdict: "bad", note: "wrong redirect", at: at(1) },
        title: "rated",
      }),
      task("4", { assigneeId: REX.id, status: "done", title: "clean" }),
    ],
    [],
  );
  const card = scorecard(model, NOW, {});
  expect(card.attention.map((a) => a.flag)).toEqual(["failed", "rated_bad", "rework"]);
  expect(card.attention[1]?.detail).toBe("wrong redirect");
  expect(card.attention.some((a) => a.title === "clean")).toBe(false);
});

test("the window keeps out what did not move in it", () => {
  const model = modelWith(
    [
      task("1", { assigneeId: REX.id, updatedAt: at(1) }),
      task("2", { assigneeId: REX.id, updatedAt: at(200) }),
    ],
    [],
  );
  expect(scorecard(model, NOW, { sinceHours: 24 }).office.finished).toBe(1);
  expect(scorecard(model, NOW, {}).office.finished).toBe(2);
});

test("rounds spent on work that never finished do not inflate the review burden", () => {
  const model = modelWith(
    [
      task("1", { assigneeId: REX.id, status: "done", reviewRounds: 0 }),
      task("2", { assigneeId: REX.id, status: "blocked", reviewRounds: 2 }),
    ],
    [],
  );
  const card = scorecard(model, NOW, {});
  const rex = card.agents.find((a) => a.name === "Rex");
  expect(rex?.finished).toBe(1);
  expect(rex?.reviewRounds).toBe(0);
  expect(card.office.reviewRounds).toBe(0);
});
