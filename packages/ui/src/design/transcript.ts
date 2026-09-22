import type { LiveEvent, RuntimeEvent } from "@ho/protocol";

export type FileChange = Extract<RuntimeEvent, { kind: "file_change" }>;

export type Step = {
  id: string;
  kind: "tool" | "steer" | "reminder";
  tool: string;
  detail: string;
  ok: boolean | null;
  change: FileChange | null;
};

export type Transcript = { steps: Step[]; text: string; activity: string | null };

const STEP_TAIL = 40;
const TEXT_TAIL = 240;
const DETAIL_MAX = 60;
const STEER_MAX = 160;

const shorten = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}…`;

const detailOf = (input: unknown): string => {
  if (typeof input !== "object" || input === null) {
    return "";
  }
  const fields: Record<string, unknown> = { ...input };
  const named = ["command", "file_path", "path", "pattern", "title", "query"];
  const pick = named.map((key) => fields[key]).find((value) => typeof value === "string");
  return shorten(pick ?? "", DETAIL_MAX);
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

export function transcriptOf(events: readonly LiveEvent[]): Transcript {
  const steps = new Map<string, Step>();
  let text = "";
  let activity: string | null = null;
  let notes = 0;
  for (const { event } of events) {
    if (event.kind === "tool_call") {
      activity = null;
      steps.set(event.id, {
        id: event.id,
        kind: "tool",
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
        kind: "tool" as const,
        tool: "edit",
        detail: event.path,
        ok: true,
        change: null,
      };
      steps.set(event.id, { ...step, change: event });
    } else if (event.kind === "text_delta") {
      text += event.text;
    } else if (event.kind === "activity") {
      activity = event.text;
    } else if (event.kind === "steer" || event.kind === "reminder") {
      notes += 1;
      const id = `${event.kind}-${String(notes)}`;
      steps.set(id, {
        id,
        kind: event.kind,
        tool: event.kind,
        detail: shorten(event.text, STEER_MAX),
        ok: true,
        change: null,
      });
    }
  }
  return {
    steps: [...steps.values()].slice(-STEP_TAIL),
    text: lastLines(text.trim()),
    activity,
  };
}
