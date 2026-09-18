import { createReadModel, type ReadModel } from "@ho/core";
import { Agent, formatReviewNote, ProjectId, Task, TaskId } from "@ho/protocol";
import { expect, test } from "bun:test";
import { recall } from "./recall.ts";

const NOW = Date.parse("2026-09-18T12:00:00.000Z");
const FLOOR = ProjectId.parse("01a0bbbb-0000-7000-8000-000000000001");
const OTHER_FLOOR = ProjectId.parse("01a0bbbb-0000-7000-8000-000000000002");
const HERE = TaskId.parse("01a0dddd-0000-7000-8000-000000000099");
const ago = (days: number): string => new Date(NOW - days * 86_400_000).toISOString();

const REX = Agent.parse({
  id: "01a0aaaa-0000-7000-8000-000000000001",
  name: "Rex",
  role: "backend",
  appearance: { gender: "neutral" },
  provider: "claude-code",
  model: "sonnet",
  effort: "high",
  budgets: {},
  projectId: FLOOR,
  createdAt: ago(90),
  updatedAt: ago(90),
});

type Seed = {
  id: string;
  title: string;
  projectId?: ProjectId;
  status?: string;
  report?: string;
  review?: string;
  days?: number;
};

const task = (seed: Seed): Task =>
  Task.parse({
    id: `01a0dddd-0000-7000-8000-0000000000${seed.id}`,
    projectId: seed.projectId ?? FLOOR,
    title: seed.title,
    brief: "",
    status: seed.status ?? "done",
    assigneeId: REX.id,
    notes: [
      ...(seed.report === undefined
        ? []
        : [
            {
              at: ago(seed.days ?? 3),
              author: { kind: "agent", agentId: REX.id },
              kind: "report",
              text: seed.report,
            },
          ]),
      ...(seed.review === undefined
        ? []
        : [
            {
              at: ago(seed.days ?? 3),
              author: { kind: "agent", agentId: REX.id },
              kind: "review",
              text: formatReviewNote("request_changes", seed.review),
            },
          ]),
    ],
    source: { kind: "manual" },
    artifacts: {},
    priority: "normal",
    createdAt: ago(seed.days ?? 3),
    updatedAt: ago(seed.days ?? 3),
  });

const modelWith = (seeds: readonly Seed[]): ReadModel => {
  const model = createReadModel();
  model.agents.set(REX.id, REX);
  for (const seed of seeds) {
    const entry = task(seed);
    model.tasks.set(entry.id, entry);
    const bucket = model.tasksByProject.get(entry.projectId) ?? new Set<TaskId>();
    bucket.add(entry.id);
    model.tasksByProject.set(entry.projectId, bucket);
  }
  return model;
};

test("the closest match to the words comes first", () => {
  const model = modelWith([
    { id: "01", title: "Dark mode for the board", report: "added a theme toggle" },
    {
      id: "02",
      title: "Rate limit the intake poller",
      report: "token bucket on the poller, 60 per minute",
    },
    { id: "03", title: "Rename the session table", report: "renamed sessions to runs" },
  ]);
  const hits = recall(model, FLOOR, HERE, "rate limit poller", 5, NOW);
  expect(hits[0]?.title).toBe("Rate limit the intake poller");
});

test("another floor's work is never returned", () => {
  const model = modelWith([
    {
      id: "01",
      title: "Rate limit the poller",
      projectId: OTHER_FLOOR,
      report: "secret neighbour work",
    },
  ]);
  expect(recall(model, FLOOR, HERE, "rate limit poller", 5, NOW)).toEqual([]);
});

test("the task you are on now is left out", () => {
  const model = modelWith([{ id: "99", title: "Rate limit the poller", report: "my own task" }]);
  expect(recall(model, FLOOR, HERE, "rate limit poller", 5, NOW)).toEqual([]);
});

test("work still in flight has nothing to teach yet", () => {
  const model = modelWith([
    { id: "01", title: "Rate limit the poller", status: "in_progress", report: "half done" },
    { id: "02", title: "Rate limit the queue", status: "blocked", report: "stuck on the design" },
  ]);
  const hits = recall(model, FLOOR, HERE, "rate limit", 5, NOW);
  expect(hits.map((h) => h.title)).toEqual(["Rate limit the queue"]);
});

test("a query nothing matches returns nothing rather than the nearest thing", () => {
  const model = modelWith([{ id: "01", title: "Dark mode", report: "a theme toggle" }]);
  expect(recall(model, FLOOR, HERE, "kubernetes ingress", 5, NOW)).toEqual([]);
});

test("a hit carries who wrote it, how old it is, and the review findings", () => {
  const model = modelWith([
    {
      id: "01",
      title: "Rate limit the poller",
      report: "token bucket",
      review: "the bucket leaks",
      days: 12,
    },
  ]);
  const [hit] = recall(model, FLOOR, HERE, "rate limit", 5, NOW);
  expect(hit?.who).toBe("Rex");
  expect(hit?.daysAgo).toBe(12);
  expect(hit?.report).toBe("token bucket");
  expect(hit?.findings[0]).toContain("the bucket leaks");
});

test("the limit is honoured", () => {
  const model = modelWith(
    Array.from({ length: 6 }, (_, index) => ({
      id: String(index + 10),
      title: `Rate limit change ${String(index)}`,
      report: "rate limit work",
    })),
  );
  expect(recall(model, FLOOR, HERE, "rate limit", 2, NOW)).toHaveLength(2);
});
