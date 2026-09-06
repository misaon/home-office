import type { SessionUpdate, StopReason, ToolCallContent } from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@ho/core";

const SUMMARY_MAX = 200;

const clip = (text: string): string =>
  text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;

const contentText = (blocks: readonly ToolCallContent[] | undefined): string =>
  (blocks ?? [])
    .map((block) =>
      block.type === "content" && block.content.type === "text" ? block.content.text : "",
    )
    .filter((text) => text !== "")
    .join(" ");

/** Per-prompt bookkeeping: the text the agent produced and the titles of tool calls still running. */
export type TurnState = { text: string; tools: Map<string, string>; toolCalls: number };

export const newTurn = (): TurnState => ({ text: "", tools: new Map(), toolCalls: 0 });

/** Maps one `session/update` notification onto the office's runtime events; plans, thoughts and usage stay internal. */
export function updateToEvents(update: SessionUpdate, turn: TurnState): RuntimeEvent[] {
  if (update.sessionUpdate === "agent_message_chunk") {
    if (update.content.type !== "text") {
      return [];
    }
    turn.text += update.content.text;
    return [{ kind: "text_delta", text: update.content.text }];
  }
  if (update.sessionUpdate === "tool_call") {
    const name = update.name ?? update.kind ?? "tool";
    turn.tools.set(update.toolCallId, update.title);
    turn.toolCalls += 1;
    const events: RuntimeEvent[] = [
      { kind: "tool_call", id: update.toolCallId, name, input: update.rawInput ?? update.title },
    ];
    if (update.status === "completed" || update.status === "failed") {
      events.push(finished(update.toolCallId, update.status, update.title, update.content));
    }
    return events;
  }
  if (update.sessionUpdate === "tool_call_update") {
    if (update.status !== "completed" && update.status !== "failed") {
      return [];
    }
    const title = update.title ?? turn.tools.get(update.toolCallId) ?? "tool";
    turn.tools.delete(update.toolCallId);
    return [finished(update.toolCallId, update.status, title, update.content ?? undefined)];
  }
  return [];
}

const finished = (
  id: string,
  status: "completed" | "failed",
  title: string,
  content: readonly ToolCallContent[] | undefined,
): RuntimeEvent => {
  const text = contentText(content);
  return {
    kind: "tool_result",
    id,
    ok: status === "completed",
    summary: clip(text === "" ? title : text),
  };
};

/** The prompt's stop reason as the office sees it: a result, or an error the daemon maps to a status. */
export function stopToEvent(stop: StopReason, turn: TurnState, sessionId: string): RuntimeEvent {
  if (stop === "max_turn_requests") {
    return { kind: "error", code: "max_turns", message: "the agent hit its turn limit" };
  }
  return {
    kind: "result",
    ok: stop === "end_turn",
    text: turn.text,
    turns: Math.max(1, turn.toolCalls),
    runtimeSessionId: sessionId,
  };
}
