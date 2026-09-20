import type { SessionUpdate, StopReason, ToolCallContent } from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@ho/protocol";

const SUMMARY_MAX = 200;
const TOOL_TITLES_MAX = 1024;

const clip = (text: string): string =>
  text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;

const contentText = (blocks: readonly ToolCallContent[] | undefined): string =>
  (blocks ?? [])
    .map((block) =>
      block.type === "content" && block.content.type === "text" ? block.content.text : "",
    )
    .filter((text) => text !== "")
    .join(" ");

export type TurnState = {
  text: string;
  tools: Map<string, string>;
  toolCalls: number;
  cost: { amount: number; currency: string } | null;
};

export const newTurn = (): TurnState => ({ text: "", tools: new Map(), toolCalls: 0, cost: null });

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

export function updateToEvents(update: SessionUpdate, turn: TurnState): RuntimeEvent[] {
  if (update.sessionUpdate === "agent_message_chunk") {
    if (update.content.type !== "text") {
      return [];
    }
    turn.text = (turn.text + update.content.text).slice(-64_000);
    return [{ kind: "text_delta", text: update.content.text }];
  }
  if (update.sessionUpdate === "tool_call") {
    const name = update.name ?? update.kind ?? "tool";
    if (turn.tools.size >= TOOL_TITLES_MAX) {
      const oldest = turn.tools.keys().next();
      if (oldest.done !== true) {
        turn.tools.delete(oldest.value);
      }
    }
    turn.tools.set(update.toolCallId, update.title);
    turn.toolCalls += 1;
    const events: RuntimeEvent[] = [
      { kind: "tool_call", id: update.toolCallId, name, input: update.rawInput ?? update.title },
    ];
    if (update.status === "completed" || update.status === "failed") {
      turn.tools.delete(update.toolCallId);
      events.push(finished(update.toolCallId, update.status, update.title, update.content));
    }
    return events;
  }
  if (update.sessionUpdate === "usage_update") {
    turn.cost =
      update.cost === undefined || update.cost === null
        ? turn.cost
        : { amount: update.cost.amount, currency: update.cost.currency };
    return [
      {
        kind: "context",
        usedTokens: update.used,
        windowTokens: update.size,
        cost: turn.cost,
      },
    ];
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

const usageOf = (turn: TurnState): RuntimeEvent => ({
  kind: "usage",
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    turns: turn.toolCalls,
  },
  ...(turn.cost?.currency === "USD" ? { costUsd: Math.max(0, turn.cost.amount) } : {}),
});

export function stopToEvents(stop: StopReason, turn: TurnState, sessionId: string): RuntimeEvent[] {
  if (stop === "max_turn_requests") {
    return [
      usageOf(turn),
      { kind: "error", code: "max_turns", message: "the agent hit its turn limit" },
    ];
  }
  return [
    usageOf(turn),
    {
      kind: "result",
      ok: stop === "end_turn",
      text: turn.text,
      turns: turn.toolCalls,
      runtimeSessionId: sessionId,
    },
  ];
}
