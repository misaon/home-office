import { type Cancellation, createChannel, type RuntimeSession } from "@ho/core";
import { errorMessage, type RuntimeEvent } from "@ho/protocol";
import type { OfficeConnection } from "./connection.ts";
import { newTurn, stopToEvent, updateToEvents } from "./events.ts";
import { isAuthRequired, type Negotiated, raceExit } from "./negotiate.ts";
import type { AcpPreset } from "./presets.ts";

export function createPrompt(
  office: OfficeConnection,
  spec: { systemPromptAppendix: string; model: string },
  preset: AcpPreset,
  negotiated: Negotiated,
  exited: Promise<number | null>,
): RuntimeSession["prompt"] {
  const { sessionId, servers } = negotiated;
  let appendixSent = false;

  return async function* prompt(
    input: { text: string },
    signal?: Cancellation,
  ): AsyncIterable<RuntimeEvent> {
    if (signal?.aborted === true) {
      return;
    }
    const events = createChannel<RuntimeEvent>(signal);
    const turn = newTurn();
    events.push({
      kind: "init",
      runtimeSessionId: sessionId,
      model: spec.model,
      plugins: [],
      pluginErrors: [],
      tools: 0,
      mcpServers: servers.map((s) => s.name),
    });
    office.onPermission(events.push);
    office.listen((update) => {
      for (const event of updateToEvents(update, turn)) {
        events.push(event);
      }
    });
    const appendix = spec.systemPromptAppendix.trim();
    const text =
      appendixSent || appendix === "" ? input.text : `${appendix}\n\n---\n\n${input.text}`;
    appendixSent = true;
    const cancel = (): void => {
      void office.conn.agent.notify("session/cancel", { sessionId }).catch(() => null);
    };
    signal?.addEventListener("abort", cancel);
    void raceExit(
      office.conn.agent.request("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text }],
      }),
      exited,
      (code) => `${preset.name} exited (code ${String(code)}) during the prompt`,
    )
      .then(
        (response) => {
          events.push(stopToEvent(response.stopReason, turn, sessionId));
        },
        (error: unknown) => {
          events.push({
            kind: "error",
            code: isAuthRequired(error) ? "authentication_failed" : "process_exit",
            message: errorMessage(error),
          });
        },
      )
      .finally(() => {
        events.close();
      });
    try {
      yield* events.iterate();
    } finally {
      signal?.removeEventListener("abort", cancel);
      office.listen(null);
      office.onPermission(null);
      events.close();
    }
  };
}
