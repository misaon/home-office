import type {
  AgentId,
  AgentRole,
  LiveEvent,
  RuntimeEvent,
  SessionId,
  SessionMode,
} from "@ho/protocol";

export type FileChange = Extract<RuntimeEvent, { kind: "file_change" }>;

export type Step = {
  id: string;
  tool: string;
  detail: string;
  ok: boolean | null;
  change: FileChange | null;
};

export type Activity = {
  id: AgentId;
  sessionId: SessionId;
  name: string;
  role: AgentRole;
  mode: SessionMode;
  model: string;
  effort: string;
  live: boolean;
  startedAt: string;
  steps: Step[];
  text: string;
  since: string;
};

const STEP_TAIL = 40;
const TEXT_TAIL = 240;
const DETAIL_MAX = 60;

const detailOf = (input: unknown): string => {
  if (typeof input !== "object" || input === null) {
    return "";
  }
  const fields: Record<string, unknown> = { ...input };
  const named = ["command", "file_path", "path", "pattern", "title", "query"];
  const pick = named.map((key) => fields[key]).find((value) => typeof value === "string");
  const text = pick ?? "";
  return text.length <= DETAIL_MAX ? text : `${text.slice(0, DETAIL_MAX)}…`;
};

const toolLabel = (name: string): string => name.replace(/^mcp__[^_]+__/u, "");

const FENCE = /^\s*```/u;

const insideFence = (dropped: readonly string[]): boolean =>
  dropped.filter((line) => FENCE.test(line)).length % 2 === 1;

const lastLines = (text: string): string => {
  if (text.length <= TEXT_TAIL) {
    return text;
  }
  const lines = text.split("\n");
  const kept: string[] = [];
  let size = 0;
  for (const line of lines.toReversed()) {
    size += line.length + 1;
    if (size > TEXT_TAIL && kept.length > 0) {
      break;
    }
    kept.unshift(line);
  }
  const dropped = lines.slice(0, lines.length - kept.length);
  return insideFence(dropped) ? ["```", ...kept].join("\n") : kept.join("\n");
};

export function transcriptOf(events: readonly LiveEvent[]): { steps: Step[]; text: string } {
  const steps = new Map<string, Step>();
  let text = "";
  for (const { event } of events) {
    if (event.kind === "tool_call") {
      steps.set(event.id, {
        id: event.id,
        tool: toolLabel(event.name),
        detail: detailOf(event.input),
        ok: null,
        change: null,
      });
    } else if (event.kind === "tool_result") {
      const step = steps.get(event.id);
      if (step !== undefined) {
        steps.set(event.id, { ...step, ok: event.ok });
      }
    } else if (event.kind === "file_change") {
      const step = steps.get(event.id) ?? {
        id: event.id,
        tool: "edit",
        detail: event.path,
        ok: true,
        change: null,
      };
      steps.set(event.id, { ...step, change: event });
    } else if (event.kind === "text_delta") {
      text += event.text;
    }
  }
  return {
    steps: [...steps.values()].slice(-STEP_TAIL),
    text: lastLines(text.trim()),
  };
}
