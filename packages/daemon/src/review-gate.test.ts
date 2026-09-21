import { createTask, fileReport, submitReview, waiveReview } from "@ho/core";
import { describeDomainError } from "@ho/protocol";
import { expect, test } from "bun:test";
import {
  apply,
  COMMIT,
  floorWith,
  human,
  ids,
  MARA,
  NOW,
  OTTO,
  PROJECT,
  record,
  REX,
  system,
  unwrap,
  workTask,
} from "./floor-fixture.ts";

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
      { verdict: "approve", findings: "holds", criteria: [] },
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
