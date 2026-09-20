import type { SessionUpdate, StopReason, ToolCallContent } from "@agentclientprotocol/sdk";
import { clip, fileChangeEvent, type RuntimeEvent } from "@ho/protocol";

const SUMMARY_MAX = 200;
const TOOL_TITLES_MAX = 1024;

type Blocks = readonly ToolCallContent[] | null | undefined;

const contentText = (blocks: Blocks): string =>
  (blocks ?? [])
    .map((block) =>
      block.type === "content" && block.content.type === "text" ? block.content.text : "",
    )
    .filter((text) => text !== "")
    .join(" ");

const diffsOf = (id: string, blocks: Blocks): RuntimeEvent[] =>
  (blocks ?? []).flatMap((block): RuntimeEvent[] =>
    block.type === "diff"
      ? [fileChangeEvent(id, block.path, block.oldText ?? null, block.newText)]
      : [],
  );

export type TurnState = {
  text: string;
  tools: Map<string, string>;
  diffs: Map<string, RuntimeEvent[]>;
  toolCalls: number;
  cost: { amount: number; currency: string } | null;
};

export const newTurn = (): TurnState => ({
  text: "",
  tools: new Map(),
  diffs: new Map(),
  toolCalls: 0,
  cost: null,
});

const remember = (turn: TurnState, id: string, blocks: Blocks): void => {
  const diffs = diffsOf(id, blocks);
  if (diffs.length > 0) {
    turn.diffs.set(id, diffs);
  }
};

const settled = (
  turn: TurnState,
  id: string,
  status: "completed" | "failed",
  title: string,
  blocks: Blocks,
): RuntimeEvent[] => {
  const text = contentText(blocks);
  const result: RuntimeEvent = {
    kind: "tool_result",
    id,
    ok: status === "completed",
    summary: clip(text === "" ? title : text, SUMMARY_MAX),
  };
  const fresh = diffsOf(id, blocks);
  const remembered = turn.diffs.get(id) ?? [];
  turn.diffs.delete(id);
  turn.tools.delete(id);
  return status === "completed" ? [result, ...(fresh.length > 0 ? fresh : remembered)] : [result];
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
        turn.diffs.delete(oldest.value);
      }
    }
    turn.tools.set(update.toolCallId, update.title);
    turn.toolCalls += 1;
    const events: RuntimeEvent[] = [
      { kind: "tool_call", id: update.toolCallId, name, input: update.rawInput ?? update.title },
    ];
    if (update.status === "completed" || update.status === "failed") {
      events.push(...settled(turn, update.toolCallId, update.status, update.title, update.content));
    } else {
      remember(turn, update.toolCallId, update.content);
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
      remember(turn, update.toolCallId, update.content);
      return [];
    }
    const title = update.title ?? turn.tools.get(update.toolCallId) ?? "tool";
    return settled(turn, update.toolCallId, update.status, title, update.content);
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
