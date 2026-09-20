import { changeSessionState, planSessionStarts } from "@ho/core";
import { Session, SYSTEM_ACTOR } from "@ho/protocol";
import { expect, test } from "bun:test";
import { scorecard } from "./evals.ts";
import {
  apply,
  floorWith,
  IDA,
  MARA,
  NOW,
  OTTO,
  record,
  REX,
  system,
  unwrap,
  workTask,
} from "./floor-fixture.ts";

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

test("a session keeps the configuration it ran with and the model the runtime confirmed", () => {
  const model = floorWith(REX, MARA);
  const taskId = workTask(model, { status: "assigned" });
  const session = Session.parse({
    id: "01a0eeee-0000-7000-8000-000000000041",
    taskId,
    agentId: REX.id,
    mode: "work",
    state: "starting",
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, turns: 0 },
    startedAt: NOW,
  });
  record(model, "session.started", { session });
  const runtime = {
    model: "sonnet",
    effort: "high" as const,
    promptHash: "abc123def456",
    skillPacks: ["work", "backend"],
    image: "ho/agent:dev",
  };
  apply(
    model,
    unwrap(
      changeSessionState(model, { sessionId: session.id, state: "starting", runtime }, system()),
    ).events,
  );
  apply(
    model,
    unwrap(
      changeSessionState(
        model,
        { sessionId: session.id, state: "running", confirmed: { model: "claude-sonnet-5" } },
        system(),
      ),
    ).events,
  );
  const stored = model.sessions.get(session.id);
  expect(stored?.runtime?.promptHash).toBe("abc123def456");
  expect(stored?.runtime?.confirmedModel).toBe("claude-sonnet-5");
  expect(stored?.runtime?.skillPacks).toEqual(["work", "backend"]);
});

test("review sessions do not make a task look retried", () => {
  const model = floorWith(REX, OTTO, MARA);
  const taskId = workTask(model, { status: "done" });
  const sessionOf = (id: string, agentId: string, mode: string): unknown =>
    Session.parse({
      id: `01a0eeee-0000-7000-8000-0000000000${id}`,
      taskId,
      agentId,
      mode,
      state: "stopped",
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, turns: 1 },
      startedAt: NOW,
      endedAt: NOW,
    });
  record(model, "session.started", { session: sessionOf("51", REX.id, "work") });
  record(model, "session.started", { session: sessionOf("52", OTTO.id, "review") });
  record(model, "session.started", { session: sessionOf("53", MARA.id, "review") });
  const card = scorecard(model, Date.parse(NOW), {});
  expect(card.attention.find((item) => item.taskId === taskId)).toBeUndefined();
});
