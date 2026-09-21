import type { TaskNote } from "@ho/protocol";
import { expect, test } from "bun:test";
import { handoverLines } from "./prompts.ts";
import { redactSecrets } from "./trace-redaction.ts";

test("a session's own secrets never reach the trace, escaped or not", () => {
  const secrets = new Set(["sk-ant-api03-verysecretvalue", 'quo"ted-secret-value']);
  const line = JSON.stringify({
    text: 'export ANTHROPIC_API_KEY=sk-ant-api03-verysecretvalue; echo quo"ted-secret-value',
  });
  const redacted = redactSecrets(line, secrets);
  expect(redacted).not.toContain("verysecretvalue");
  expect(redacted).not.toContain("ted-secret-value");
  expect(redacted).toContain("***");
});

test("credential shapes are redacted even when the office does not know the value", () => {
  const text = [
    "Authorization: Bearer abcdefghijklmnop",
    "token ghp_abcdefghijklmnopqrstuvwxyz0123",
    "AKIAABCDEFGHIJKLMNOP",
    "https://user:pass@example.com/repo.git",
    "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----",
  ].join("\n");
  const redacted = redactSecrets(text, new Set());
  expect(redacted).toBe(
    [
      "Authorization: Bearer ***",
      "token ***",
      "***",
      "https://***@example.com/repo.git",
      "***",
    ].join("\n"),
  );
});

test("ordinary output is left alone", () => {
  const text = "bun test v1.4.2 passed 51 tests in 176ms; see https://example.com/docs";
  expect(redactSecrets(text, new Set(["short"]))).toBe(text);
});

const at = (minute: number): string => `2026-09-20T10:${String(minute).padStart(2, "0")}:00.000Z`;

test("a handover keeps findings and questions, clips the rest and says what it left out", () => {
  const filler = (minute: number): TaskNote => ({
    at: at(minute),
    author: { kind: "human" },
    kind: "info",
    text: String.fromCodePoint(96 + minute).repeat(5000),
  });
  const notes: TaskNote[] = [
    ...[1, 2, 5, 6, 7, 8].map((minute) => filler(minute)),
    {
      at: at(3),
      author: { kind: "system" },
      kind: "review",
      text: "verification failed: `bun run check`\n\ntype error in foo.ts",
    },
    { at: at(4), author: { kind: "human" }, kind: "answer", text: "use Zod" },
  ];
  const lines = handoverLines(notes);
  const joined = lines.join("\n");
  expect(joined).toContain("verification failed");
  expect(joined).toContain("use Zod");
  expect(joined.length).toBeLessThan(6500);
  expect(lines.at(-1)).toContain("left out");
  expect(lines.findIndex((line) => line.includes("verification failed"))).toBeLessThan(
    lines.findIndex((line) => line.includes("use Zod")),
  );
});
