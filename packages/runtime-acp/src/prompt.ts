import {
  createChannel,
  type RuntimeSession,
  type RuntimeSessionSpec,
  type RuntimeEvent,
  type Cancellation,
} from "@ho/core";
import type { OfficeConnection } from "./connection.ts";
import { newTurn, stopToEvent, updateToEvents } from "./events.ts";
import { describe, isAuthRequired, type Negotiated } from "./negotiate.ts";
import type { AcpPreset } from "./presets.ts";

export function createPrompt(
  office: OfficeConnection,
  spec: RuntimeSessionSpec,
  preset: AcpPreset,
  negotiated: Negotiated,
  exited: Promise<number | null>,
  lastStderr: () => string,
): RuntimeSession["prompt"] {
  const { sessionId, resumed, servers } = negotiated;
  let first = true;

  async function* prompt(
    input: { text: string },
    signal?: Cancellation,
  ): AsyncIterable<RuntimeEvent> {
    const needsAppendix = first && !resumed;
    const events = createChannel<RuntimeEvent>(signal);
    const turn = newTurn();
    if (first) {
      first = false;
      events.push({
        kind: "init",
        runtimeSessionId: sessionId,
        model: spec.model,
        plugins: [],
        pluginErrors: [],
        tools: 0,
        mcpServers: servers.map((s) => s.name),
      });
    }
    const flush = (): void => {
      for (const event of office.drain()) {
        events.push(event);
      }
    };
    office.listen((update) => {
      flush();
      try {
        for (const event of updateToEvents(update, turn)) {
          events.push(event);
        }
      } catch (error) {
        events.push({ kind: "error", code: "process_exit", message: describe(error) });
        events.close();
      }
    });
    const appendix = spec.systemPromptAppendix.trim();
    const text =
      !needsAppendix || appendix === "" ? input.text : `${appendix}\n\n---\n\n${input.text}`;
    const cancel = (): void => {
      void office.conn.agent.notify("session/cancel", { sessionId }).catch(() => null);
    };
    signal?.addEventListener("abort", cancel);
    if (signal?.aborted === true) {
      cancel();
      events.close();
      signal.removeEventListener("abort", cancel);
      office.listen(null);
      return;
    }
    void Promise.race([
      office.conn.agent.request("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text }],
      }),
      exited.then((code) => {
        throw new Error(
          `${preset.name} exited (code ${String(code)}) during the prompt${lastStderr()}`,
        );
      }),
    ])
      .then(
        (response) => {
          flush();
          events.push(stopToEvent(response.stopReason, turn, sessionId));
        },
        (error: unknown) => {
          events.push({
            kind: "error",
            code: isAuthRequired(error) ? "authentication_failed" : "process_exit",
            message: describe(error),
          });
        },
      )
      .finally(() => {
        office.listen(null);
        events.close();
      });
    try {
      yield* events.iterate();
    } finally {
      signal?.removeEventListener("abort", cancel);
      office.listen(null);
      events.close();
    }
  }
  return prompt;
}
