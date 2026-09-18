import { AgentId, formatReviewNote, Task } from "@ho/protocol";
import { expect, test } from "bun:test";
import { openingMessage } from "./prompts.ts";

const QA = AgentId.parse("01a0aaaa-0000-7000-8000-000000000001");
const HEAD = AgentId.parse("01a0aaaa-0000-7000-8000-000000000002");

type Note = { at: string; author: unknown; kind: string; text: string };

const byAgent = (agentId: AgentId, kind: string, text: string, at: string): Note => ({
  at,
  author: { kind: "agent", agentId },
  kind,
  text,
});

const taskWith = (notes: readonly Note[]): Task =>
  Task.parse({
    id: "01a0dddd-0000-7000-8000-000000000001",
    projectId: "01a0bbbb-0000-7000-8000-000000000001",
    title: "Rate limit the poller",
    brief: "the brief",
    status: "review",
    notes,
    source: { kind: "manual" },
    artifacts: {},
    priority: "normal",
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T18:00:00.000Z",
  });

const ROUND_ONE: Note[] = [
  byAgent(QA, "report", "first attempt", "2026-09-01T10:00:00.000Z"),
  byAgent(QA, "review", formatReviewNote("approve", "tested, holds"), "2026-09-01T11:00:00.000Z"),
  byAgent(
    HEAD,
    "review",
    formatReviewNote("request_changes", "1. naming"),
    "2026-09-01T12:00:00.000Z",
  ),
  byAgent(QA, "report", "renamed as asked", "2026-09-01T13:00:00.000Z"),
];

test("a first-time reviewer is not told they reviewed before", () => {
  const message = openingMessage(taskWith(ROUND_ONE.slice(0, 1)), "review", undefined, QA);
  expect(message).not.toContain("You reviewed this branch before");
  expect(message).toContain("the brief");
});

test("a returning reviewer sees their own verdict, when they filed it, and what followed", () => {
  const message = openingMessage(taskWith(ROUND_ONE), "review", undefined, QA);
  expect(message).toContain("You reviewed this branch before, at 2026-09-01T11:00:00.000Z");
  expect(message).toContain("tested, holds");
  expect(message).toContain("What happened after it");
  expect(message).toContain("naming");
  expect(message).toContain("renamed as asked");
});

test("a reviewer is never shown somebody else's earlier verdict as their own", () => {
  const stranger = AgentId.parse("01a0aaaa-0000-7000-8000-000000000009");
  const message = openingMessage(taskWith(ROUND_ONE), "review", undefined, stranger);
  expect(message).not.toContain("You reviewed this branch before");
});

test("verdicts filed earlier in the current round are still shown", () => {
  const notes: Note[] = [
    ...ROUND_ONE,
    byAgent(QA, "review", formatReviewNote("approve", "still holds"), "2026-09-01T14:00:00.000Z"),
  ];
  const message = openingMessage(taskWith(notes), "review", undefined, HEAD);
  expect(message).toContain("Verdicts before yours in this round");
  expect(message).toContain("still holds");
});

test("a work session is untouched by any of this", () => {
  const message = openingMessage(taskWith(ROUND_ONE), "work", undefined, QA);
  expect(message).not.toContain("You reviewed this branch before");
  expect(message).toContain("the brief");
});
