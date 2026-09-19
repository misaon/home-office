import { applyEvent, createReadModel } from "@ho/core";
import { SessionId, StoredEvent, type Usage, ZERO_USAGE } from "@ho/protocol";
import { expect, test } from "bun:test";

const SESSION = SessionId.parse("01a0eeee-0000-7000-8000-000000000001");

const stored = (seq: number, type: string, payload: unknown): StoredEvent =>
  StoredEvent.parse({
    seq,
    id: `01a0cccc-0000-7000-8000-00000000000${String(seq)}`,
    at: "2026-09-01T10:00:00.000Z",
    actor: { kind: "system" },
    type,
    payload,
  });

const session = {
  id: SESSION,
  taskId: "01a0dddd-0000-7000-8000-000000000001",
  agentId: "01a0aaaa-0000-7000-8000-000000000001",
  mode: "work",
  state: "running",
  usage: ZERO_USAGE,
  startedAt: "2026-09-01T10:00:00.000Z",
};

const usage = (turns: number): Usage => ({
  ...ZERO_USAGE,
  inputTokens: 100,
  outputTokens: 10,
  turns,
});

test("the running cost a provider reports replaces, it never accumulates", () => {
  const model = createReadModel();
  applyEvent(model, stored(1, "session.started", { session }));
  applyEvent(
    model,
    stored(2, "session.usage_recorded", { sessionId: SESSION, usage: usage(1), costUsd: 0.12 }),
  );
  applyEvent(
    model,
    stored(3, "session.usage_recorded", { sessionId: SESSION, usage: usage(2), costUsd: 0.31 }),
  );
  const after = model.sessions.get(SESSION);
  expect(after?.costUsd).toBe(0.31);
  expect(after?.usage.turns).toBe(3);
});

test("a turn that reports no cost leaves the last one standing", () => {
  const model = createReadModel();
  applyEvent(model, stored(1, "session.started", { session }));
  applyEvent(
    model,
    stored(2, "session.usage_recorded", { sessionId: SESSION, usage: usage(1), costUsd: 0.5 }),
  );
  applyEvent(model, stored(3, "session.usage_recorded", { sessionId: SESSION, usage: usage(1) }));
  expect(model.sessions.get(SESSION)?.costUsd).toBe(0.5);
});

test("a session whose provider never reports a cost carries none", () => {
  const model = createReadModel();
  applyEvent(model, stored(1, "session.started", { session }));
  applyEvent(model, stored(2, "session.usage_recorded", { sessionId: SESSION, usage: usage(1) }));
  expect(model.sessions.get(SESSION)?.costUsd).toBeUndefined();
});
