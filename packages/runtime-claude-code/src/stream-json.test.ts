import { expect, test } from "bun:test";
import { normalizeLine } from "./stream-json.ts";

test("the estimate is read off the result line the CLI prints", () => {
  const line = JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: "s-1",
    num_turns: 4,
    usage: {
      input_tokens: 10,
      output_tokens: 2,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    total_cost_usd: 0.4242,
  });
  const events = [
    ...normalizeLine(
      line,
      () => new Date(),
      () => undefined,
    ),
  ];
  const reported = events.find((event) => event.kind === "usage");
  expect(reported?.kind).toBe("usage");
  expect(reported?.kind === "usage" ? reported.costUsd : null).toBe(0.4242);
});

test("a result line without a cost yields usage without one", () => {
  const line = JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: "s-1",
    num_turns: 1,
  });
  const events = [
    ...normalizeLine(
      line,
      () => new Date(),
      () => undefined,
    ),
  ];
  const reported = events.find((event) => event.kind === "usage");
  expect(reported?.kind === "usage" ? reported.costUsd : "missing").toBeUndefined();
});
