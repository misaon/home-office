import {
  applyEvent,
  type CommandContext,
  createIdFactory,
  createReadModel,
  createTask,
  fileReport,
  planSessionStarts,
  type ReadModel,
  submitReview,
  waiveReview,
} from "@ho/core";
import {
  Agent,
  describeDomainError,
  errorMessage,
  HUMAN_ACTOR,
  type NewEvent,
  Project,
  ProjectId,
  Session,
  StoredEvent,
  SYSTEM_ACTOR,
  Task,
  type TaskId,
} from "@ho/protocol";
import { expect, test } from "bun:test";
import { scorecard } from "./evals.ts";

const NOW = "2026-09-20T12:00:00.000Z";
const PROJECT = ProjectId.parse("01a0bbbb-0000-7000-8000-000000000002");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

const ids = createIdFactory(
  { now: () => new Date(NOW) },
  {
    randomize: (bytes) => {
      crypto.getRandomValues(bytes);
    },
  },
);

const human = (): CommandContext => ({ ids, now: NOW, actor: HUMAN_ACTOR });
const system = (): CommandContext => ({ ids, now: NOW, actor: SYSTEM_ACTOR });

const person = (id: string, name: string, role: string, budgets: object = {}): Agent =>
  Agent.parse({
    id: `01a0aaaa-0000-7000-8000-0000000000${id}`,
    name,
    role,
    appearance: { gender: "neutral" },
    provider: "claude-code",
    model: "sonnet",
    effort: "high",
    budgets,
    projectId: PROJECT,
    createdAt: NOW,
    updatedAt: NOW,
  });

const REX = person("11", "Rex", "backend", { maxTurnsPerTask: 10 });
const IDA = person("12", "Ida", "frontend");
const MARA = person("13", "Mara", "head");
const OTTO = person("14", "Otto", "qa");

let seq = 0;

const record = (model: ReadModel, type: string, payload: unknown): void => {
  seq += 1;
  applyEvent(
    model,
    StoredEvent.parse({ id: ids.event(), at: NOW, actor: HUMAN_ACTOR, type, payload, seq }),
  );
};

const apply = (model: ReadModel, events: readonly NewEvent[]): void => {
  for (const event of events) {
    record(model, event.type, event.payload);
  }
};

const floorWith = (...staff: readonly Agent[]): ReadModel => {
  const model = createReadModel();
  record(model, "project.created", {
    project: Project.parse({
      id: PROJECT,
      name: "floor",
      repo: { kind: "local", path: "/tmp/floor" },
      createdAt: NOW,
      updatedAt: NOW,
    }),
  });
  for (const agent of staff) {
    record(model, "agent.created", { agent });
  }
  return model;
};

const workTask = (
  model: ReadModel,
  fields: Partial<{
    id: string;
    status: string;
    kind: string;
    assigneeId: string;
    reviews: object;
    dependsOn: string[];
    artifacts: object;
    priority: string;
    title: string;
  }>,
): TaskId => {
  const task = Task.parse({
    id: fields.id ?? ids.task(),
    projectId: PROJECT,
    kind: fields.kind ?? "work",
    title: fields.title ?? "a change",
    brief: "",
    status: fields.status ?? "in_progress",
    assigneeId: fields.assigneeId ?? REX.id,
    reviews: fields.reviews ?? { qa: true, security: false, head: true },
    dependsOn: fields.dependsOn ?? [],
    source: { kind: "manual" },
    artifacts: fields.artifacts ?? {},
    priority: fields.priority ?? "normal",
    createdAt: NOW,
    updatedAt: NOW,
  });
  record(model, "task.created", { task });
  return task.id;
};

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) {
    throw new Error(errorMessage(result.error));
  }
  return result.value;
};

test("a requested review with nobody to give it blocks the task and names the role", () => {
  const model = floorWith(REX, MARA);
  const taskId = workTask(model, { reviews: { qa: true, security: false, head: true } });
  const { events } = unwrap(
    fileReport(model, taskId, { status: "review", summary: "ready" }, human()),
  );
  const change = events.findLast((event) => event.type === "task.status_changed");
  expect(change?.type === "task.status_changed" ? change.payload.to : null).toBe("blocked");
  expect(change?.type === "task.status_changed" ? change.payload.reason : "").toContain(
    "QA engineer",
  );
});

test("the human can waive the missing stage and the task moves on to the reviewers who exist", () => {
  const model = floorWith(REX, MARA);
  const taskId = workTask(model, {
    status: "blocked",
    reviews: { qa: true, security: false, head: true },
    artifacts: { commit: COMMIT },
  });
  const { events } = unwrap(waiveReview(model, { id: taskId, stage: "qa" }, human()));
  apply(model, events);
  const task = model.tasks.get(taskId);
  expect(task?.reviews.qa).toBe(false);
  expect(task?.status).toBe("review");
  expect(task?.reviewerId).toBe(MARA.id);
});

test("an agent cannot waive a review, and a waiver of a stage nobody asked for is refused", () => {
  const model = floorWith(REX, MARA);
  const taskId = workTask(model, { status: "blocked", artifacts: { commit: COMMIT } });
  expect(waiveReview(model, { id: taskId, stage: "qa" }, system()).ok).toBe(false);
  expect(waiveReview(model, { id: taskId, stage: "security" }, human()).ok).toBe(false);
});

test("creating a task that asks for a reviewer the floor lacks is refused up front", () => {
  const model = floorWith(REX, MARA);
  const refused = createTask(
    model,
    {
      projectId: PROJECT,
      title: "needs QA",
      brief: "",
      priority: "normal",
      reviews: { qa: true, security: false, head: true },
    },
    human(),
  );
  expect(refused.ok).toBe(false);
  expect(refused.ok ? "" : describeDomainError(refused.error)).toContain("QA engineer");
  const allowed = createTask(
    model,
    { projectId: PROJECT, title: "no QA", brief: "", priority: "normal" },
    human(),
  );
  expect(allowed.ok).toBe(true);
});

test("an approval records the commit it judged and passes it down the chain unchanged", () => {
  const model = floorWith(REX, OTTO, MARA);
  const taskId = workTask(model, { reviews: { qa: true, security: false, head: true } });
  apply(
    model,
    unwrap(fileReport(model, taskId, { status: "review", summary: "r" }, human())).events,
  );
  record(model, "task.artifacts_changed", { taskId, artifacts: { commit: COMMIT } });
  expect(model.tasks.get(taskId)?.reviewerId).toBe(OTTO.id);
  const approved = unwrap(
    submitReview(
      model,
      taskId,
      { verdict: "approve", findings: "holds" },
      { ids, now: NOW, actor: { kind: "agent", agentId: OTTO.id } },
    ),
  );
  const recorded = approved.events.find((event) => event.type === "task.review_recorded");
  expect(recorded?.type === "task.review_recorded" ? recorded.payload.commit : null).toBe(COMMIT);
  const note = approved.events.find((event) => event.type === "task.note_added");
  expect(note?.type === "task.note_added" ? note.payload.note.commit : null).toBe(COMMIT);
  apply(model, approved.events);
  expect(model.tasks.get(taskId)?.reviewerId).toBe(MARA.id);
});

test("a task waits for the work it builds on and starts once that work is done", () => {
  const model = floorWith(REX, IDA, MARA);
  const first = workTask(model, {
    id: "01a0dddd-0000-7000-8000-000000000021",
    status: "assigned",
    assigneeId: REX.id,
    priority: "high",
    title: "A: create API",
  });
  const second = workTask(model, {
    id: "01a0dddd-0000-7000-8000-000000000022",
    status: "assigned",
    assigneeId: IDA.id,
    dependsOn: [first],
    title: "B: use API from A",
  });
  const before = planSessionStarts(model, 4, false);
  expect(before.starts.map((start) => start.taskId)).toEqual([first]);
  expect(before.skipped.find((skip) => skip.taskId === second)?.reason).toContain("waits for");
  record(model, "task.status_changed", { taskId: first, from: "assigned", to: "done" });
  const after = planSessionStarts(model, 4, false);
  expect(after.starts.map((start) => start.taskId)).toEqual([second]);
});

test("a task whose agent has spent its turns on it is set aside for the human, not restarted", () => {
  const model = floorWith(REX, MARA);
  const taskId = workTask(model, { status: "assigned", assigneeId: REX.id });
  record(model, "session.started", {
    session: Session.parse({
      id: "01a0eeee-0000-7000-8000-000000000031",
      taskId,
      agentId: REX.id,
      mode: "work",
      state: "stopped",
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        turns: 10,
      },
      startedAt: NOW,
      endedAt: NOW,
    }),
  });
  const plan = planSessionStarts(model, 4, false);
  expect(plan.starts).toEqual([]);
  expect(plan.exhausted.find((entry) => entry.taskId === taskId)?.reason).toContain("10 turns");
});

test("the scorecard counts product work only, and a failed check spoils the first pass", () => {
  const model = floorWith(REX, MARA);
  workTask(model, {
    kind: "triage",
    status: "done",
    reviews: { qa: false, security: false, head: false },
  });
  const clean = workTask(model, { status: "done" });
  const retried = workTask(model, { status: "done" });
  record(model, "task.note_added", {
    taskId: retried,
    note: {
      at: NOW,
      author: SYSTEM_ACTOR,
      kind: "review",
      text: "verification failed: `bun run check`\n\nfailed",
    },
  });
  const card = scorecard(model, Date.parse(NOW), {});
  expect(card.office.finished).toBe(2);
  expect(card.office.planning).toBe(1);
  expect(card.office.firstPass).toBe(1);
  expect(card.office.verifyFailures).toBe(1);
  expect(model.tasks.get(clean)?.status).toBe("done");
});
