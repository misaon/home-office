import { escalatedEffort, setbacksOf } from "@ho/core";
import { PROVIDERS, SYSTEM_ACTOR, Task, VERIFY_NOTE_PREFIX } from "@ho/protocol";
import { expect, test } from "bun:test";

const CLAUDE = PROVIDERS["claude-code"].effortLevels;
const CODEX = PROVIDERS.codex.effortLevels;

const taskWith = (fields: { verifyFailures?: number; reviewRounds?: number }): Task =>
  Task.parse({
    id: "01a0dddd-0000-7000-8000-000000000001",
    projectId: "01a0bbbb-0000-7000-8000-000000000001",
    title: "t",
    brief: "",
    status: "assigned",
    reviewRounds: fields.reviewRounds ?? 0,
    notes: [
      ...Array.from({ length: fields.verifyFailures ?? 0 }, (_unused, index) => ({
        at: `2026-09-0${String(index + 1)}T10:00:00.000Z`,
        author: SYSTEM_ACTOR,
        kind: "review",
        text: `${VERIFY_NOTE_PREFIX} \`bun run check\`\n\nfailed`,
      })),
      {
        at: "2026-09-09T10:00:00.000Z",
        author: SYSTEM_ACTOR,
        kind: "review",
        text: "approve: unrelated note that is not a verification failure",
      },
    ],
    source: { kind: "manual" },
    artifacts: {},
    priority: "normal",
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
  });

test("work that has not failed is run exactly as configured", () => {
  expect(escalatedEffort("high", CLAUDE, 0)).toBe("high");
  expect(setbacksOf(taskWith({}))).toBe(0);
});

test("each verified setback buys one more level of thinking", () => {
  expect(escalatedEffort("high", CLAUDE, 1)).toBe("xhigh");
  expect(escalatedEffort("high", CLAUDE, 2)).toBe("max");
  expect(escalatedEffort("low", CLAUDE, 2)).toBe("high");
});

test("escalation stops at the highest level the provider has", () => {
  expect(escalatedEffort("high", CLAUDE, 9)).toBe("max");
  expect(escalatedEffort("high", CODEX, 9)).toBe("xhigh");
  expect(CODEX).not.toContain("max");
});

test("a level the provider does not have is left alone rather than guessed at", () => {
  expect(escalatedEffort("max", CODEX, 3)).toBe("max");
});

test("setbacks count failed checks and rework, not unrelated notes", () => {
  expect(setbacksOf(taskWith({ verifyFailures: 2 }))).toBe(2);
  expect(setbacksOf(taskWith({ reviewRounds: 1 }))).toBe(1);
  expect(setbacksOf(taskWith({ verifyFailures: 1, reviewRounds: 2 }))).toBe(3);
});

test("the default retry budget escalates once before a task is blocked", () => {
  const afterOneFailure = setbacksOf(taskWith({ verifyFailures: 1 }));
  expect(afterOneFailure).toBe(1);
  expect(escalatedEffort("high", CLAUDE, afterOneFailure)).toBe("xhigh");
});
