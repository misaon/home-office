import {
  applyEvent,
  type CommandContext,
  createIdFactory,
  createReadModel,
  fileReport,
  isLastReviewerOfStage,
  membersOf,
  type ReadModel,
  removeAgent,
} from "@ho/core";
import {
  Agent,
  errorMessage,
  HUMAN_ACTOR,
  Project,
  ProjectId,
  Session,
  StoredEvent,
  Task,
  type TaskId,
} from "@ho/protocol";
import { expect, test } from "bun:test";
import { scorecard } from "./evals.ts";

const NOW = "2026-09-19T12:00:00.000Z";
const PROJECT = ProjectId.parse("01a0bbbb-0000-7000-8000-000000000001");
const TASK = "01a0dddd-0000-7000-8000-000000000001";

const ids = createIdFactory(
  { now: () => new Date(NOW) },
  {
    randomize: (bytes) => {
      crypto.getRandomValues(bytes);
    },
  },
);

const context = (): CommandContext => ({ ids, now: NOW, actor: HUMAN_ACTOR });

const person = (id: string, name: string, role: string): Agent =>
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
    createdAt: NOW,
    updatedAt: NOW,
  });

const REX = person("1", "Rex", "backend");
const MARA = person("2", "Mara", "head");
const NOEMI = person("3", "Noemi", "head");
const OTTO = person("4", "Otto", "qa");

let seq = 0;

const record = (model: ReadModel, type: string, payload: unknown): void => {
  seq += 1;
  applyEvent(
    model,
    StoredEvent.parse({ id: ids.event(), at: NOW, actor: HUMAN_ACTOR, type, payload, seq }),
  );
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

const doneTask = (assignee: Agent): unknown =>
  Task.parse({
    id: TASK,
    projectId: PROJECT,
    title: "a change",
    brief: "",
    status: "done",
    assigneeId: assignee.id,
    source: { kind: "manual" },
    artifacts: {},
    priority: "normal",
    createdAt: NOW,
    updatedAt: NOW,
  });

const inProgress = (model: ReadModel, assignee: Agent): TaskId => {
  const task = Task.parse({
    id: TASK,
    projectId: PROJECT,
    title: "a change",
    brief: "",
    status: "in_progress",
    assigneeId: assignee.id,
    source: { kind: "manual" },
    artifacts: {},
    priority: "normal",
    createdAt: NOW,
    updatedAt: NOW,
  });
  record(model, "task.created", { task });
  return task.id;
};

const statusAfterReport = (model: ReadModel, taskId: TaskId): string | undefined => {
  const result = fileReport(model, taskId, { status: "review", summary: "done" }, context());
  if (!result.ok) {
    throw new Error(errorMessage(result.error));
  }
  const last = result.value.events.findLast((event) => event.type === "task.status_changed");
  return last?.type === "task.status_changed" ? last.payload.to : undefined;
};

test("a floor with nobody to review approves its own work", () => {
  const model = floorWith(REX);
  expect(statusAfterReport(model, inProgress(model, REX))).toBe("done");
});

test("the same report waits for review once a head of development is there", () => {
  const model = floorWith(REX, MARA);
  expect(statusAfterReport(model, inProgress(model, REX))).toBe("review");
});

test("the only holder of a review stage is recognised, a second one is not", () => {
  const alone = floorWith(REX, MARA, OTTO);
  expect(isLastReviewerOfStage(alone, MARA)).toBe(true);
  expect(isLastReviewerOfStage(alone, OTTO)).toBe(true);
  expect(isLastReviewerOfStage(alone, REX)).toBe(false);

  const covered = floorWith(REX, MARA, NOEMI);
  expect(isLastReviewerOfStage(covered, MARA)).toBe(false);
});

test("a dismissal records why, a removal without one records nothing", () => {
  const model = floorWith(REX, MARA);
  const withReason = removeAgent(model, REX.id, context(), "this floor stopped shipping backends");
  const without = removeAgent(model, REX.id, context());
  if (!withReason.ok || !without.ok) {
    throw new Error("removal was refused");
  }
  expect(withReason.value.events[0]?.payload).toEqual({
    agentId: REX.id,
    reason: "this floor stopped shipping backends",
  });
  expect(without.value.events[0]?.payload).toEqual({ agentId: REX.id });
});

test("someone who left is off the roster and still in the record", () => {
  const model = floorWith(REX, MARA);
  record(model, "agent.removed", { agentId: REX.id, reason: "no backend work left" });
  expect(membersOf(model, PROJECT).map((agent) => agent.name)).toEqual(["Mara"]);
  expect(model.agents.has(REX.id)).toBe(false);
  expect(model.formerAgents.get(REX.id)?.name).toBe("Rex");
});

test("work of someone who left still counts, and their role keeps the cost without the head", () => {
  const model = floorWith(REX, MARA);
  record(model, "task.created", { task: doneTask(REX) });
  record(model, "session.started", {
    session: Session.parse({
      id: "01a0eeee-0000-7000-8000-000000000001",
      taskId: TASK,
      agentId: REX.id,
      state: "stopped",
      usage: {
        inputTokens: 1000,
        outputTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        turns: 3,
      },
      costUsd: 4.5,
      startedAt: NOW,
      endedAt: NOW,
    }),
  });
  record(model, "agent.removed", { agentId: REX.id, reason: "no backend work left" });

  const card = scorecard(model, Date.parse(NOW), {});
  const rex = card.agents.find((agent) => agent.name === "Rex");
  expect(rex?.departed).toBe(true);
  expect(rex?.finished).toBe(1);
  expect(rex?.costUsd).toBe(4.5);

  const backend = card.roles.find((role) => role.role === "backend");
  expect(backend?.people).toBe(0);
  expect(backend?.costUsd).toBe(4.5);
  expect(card.office.costUsd).toBe(4.5);
});
