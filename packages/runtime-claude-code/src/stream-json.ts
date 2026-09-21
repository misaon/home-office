import {
  clip,
  compact,
  type PlanWindow,
  type RuntimeErrorCode,
  type RuntimeEvent,
} from "@ho/protocol";
import { fileChangeOf } from "./file-change.ts";
import {
  type ContentBlock,
  type ModelUsage,
  type RateWindow,
  type ResultLine,
  StreamLine,
  type SystemLine,
  TextBlock,
  Usage,
} from "./stream-json-schema.ts";

const SPEND_LIMIT_PATTERN = /\b(?:spend|usage|weekly) limit\b/iu;
const SUMMARY_MAX = 200;
const SILENT_SYSTEM = new Set([
  "status",
  "thinking_tokens",
  "task_started",
  "task_updated",
  "background_tasks_changed",
  "vcs_state_changed",
]);
const EXIT_CODE = /exit code (?<code>-?\d+)/u;
const PERCENT_DECIMALS = 10;

const summarize = (content: string | unknown[] | undefined): string => {
  if (content === undefined) {
    return "";
  }
  const text =
    typeof content === "string"
      ? content
      : content
          .map((block) => {
            const parsed = TextBlock.safeParse(block);
            return parsed.success ? parsed.data.text : "";
          })
          .join(" ");
  return clip(text, SUMMARY_MAX);
};

const userEvents = (content: string | ContentBlock[], toolUseResult: unknown): RuntimeEvent[] => {
  if (typeof content === "string") {
    return [];
  }
  return content.flatMap((block): RuntimeEvent[] => {
    if (block.type !== "tool_result") {
      return [];
    }
    const result: RuntimeEvent = {
      kind: "tool_result",
      id: block.tool_use_id,
      ok: block.is_error !== true,
      summary: summarize(block.content),
    };
    const change = block.is_error === true ? null : fileChangeOf(block.tool_use_id, toolUseResult);
    return change === null ? [result] : [result, change];
  });
};

const RETRY_ERROR_CODES: Readonly<Record<string, RuntimeErrorCode>> = {
  authentication_failed: "authentication_failed",
  oauth_org_not_allowed: "authentication_failed",
  billing_error: "billing_error",
  model_not_found: "model_not_found",
  invalid_request: "invalid_request",
};

const exitCodeOf = (summary: string): number | null => {
  const code = EXIT_CODE.exec(summary)?.groups?.["code"];
  return code === undefined ? null : Number(code);
};

const systemEvents = (
  line: SystemLine,
  raw: string,
  now: () => Date,
  onIgnored: (text: string) => void,
): RuntimeEvent[] => {
  if (line.subtype === "init" && line.session_id !== undefined) {
    return [
      {
        kind: "init",
        runtimeSessionId: line.session_id,
        model: line.model ?? "unknown",
        plugins: (line.plugins ?? []).map((p) => p.name),
        pluginErrors: (line.plugin_errors ?? []).map((p) => `${p.plugin}: ${p.message}`),
        tools: line.tools?.length ?? 0,
        mcpServers: (line.mcp_servers ?? []).map((s) => s.name),
      },
    ];
  }
  if (line.subtype === "api_retry" && line.error === "rate_limit") {
    const retryAt =
      line.retry_delay_ms === undefined
        ? null
        : new Date(now().getTime() + line.retry_delay_ms).toISOString();
    return [{ kind: "rate_limited", retryAt }];
  }
  const code = line.error === undefined ? undefined : RETRY_ERROR_CODES[line.error];
  if (line.subtype === "api_retry" && code !== undefined) {
    return [{ kind: "error", code, message: `api retry: ${line.error ?? ""}` }];
  }
  if (line.subtype === "task_notification") {
    const summary = line.summary ?? "";
    return [
      {
        kind: "background_done",
        id: line.tool_use_id ?? line.task_id ?? "",
        status: line.status ?? "unknown",
        exitCode: exitCodeOf(summary),
        summary: clip(summary, SUMMARY_MAX),
      },
    ];
  }
  if (!SILENT_SYSTEM.has(line.subtype)) {
    onIgnored(raw);
  }
  return [];
};

const windowOf = (window: RateWindow | undefined): PlanWindow | null => {
  if (window?.utilization === undefined || window.utilization === null) {
    return null;
  }
  const percent = Math.round(window.utilization * 100 * PERCENT_DECIMALS) / PERCENT_DECIMALS;
  const resetsAt =
    window.resetsAt === undefined || window.resetsAt === null
      ? null
      : new Date(window.resetsAt * 1000).toISOString();
  return { percent: Math.max(0, percent), resetsAt };
};

const costBasisOf = (modelUsage: ModelUsage): string | undefined => {
  const bases = new Set(
    Object.values(modelUsage)
      .map((entry) => entry.costBasis)
      .filter((basis): basis is string => basis !== undefined),
  );
  return bases.size === 0 ? undefined : [...bases].toSorted().join("+");
};

const resultEvents = (line: ResultLine): RuntimeEvent[] => {
  const usage = line.usage ?? Usage.parse({});
  const events: RuntimeEvent[] = [
    {
      kind: "usage",
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        cacheWriteTokens: usage.cache_creation_input_tokens,
        turns: line.num_turns,
        ...compact({
          thinkingTokens: usage.output_tokens_details?.thinking_tokens,
          apiMs: line.duration_api_ms,
        }),
      },
      ...compact({
        costUsd: line.total_cost_usd,
        costBasis: line.modelUsage === undefined ? undefined : costBasisOf(line.modelUsage),
        ttftMs: line.ttft_ms,
        wallMs: line.duration_ms,
      }),
    },
  ];
  if (line.is_error && line.subtype === "error_max_turns") {
    events.push({ kind: "error", code: "max_turns", message: "turn budget exhausted" });
  }
  if (line.is_error && SPEND_LIMIT_PATTERN.test(line.result ?? "")) {
    events.push({ kind: "rate_limited", retryAt: null });
  }
  events.push({
    kind: "result",
    ok: !line.is_error,
    text: line.result ?? "",
    ...compact({ structured: line.structured_output }),
    turns: line.num_turns,
    runtimeSessionId: line.session_id,
  });
  return events;
};

export function normalizeLine(
  raw: string,
  now: () => Date,
  onIgnored: (text: string) => void = () => undefined,
): RuntimeEvent[] {
  if (!raw.startsWith("{")) {
    if (raw.trim() !== "") {
      onIgnored(raw);
    }
    return [];
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    onIgnored(raw);
    return [];
  }
  const parsed = StreamLine.safeParse(json);
  if (!parsed.success) {
    onIgnored(raw);
    return [];
  }
  const line = parsed.data;
  switch (line.type) {
    case "system": {
      return systemEvents(line, raw, now, onIgnored);
    }
    case "assistant": {
      return line.message.content.flatMap((block): RuntimeEvent[] =>
        block.type === "tool_use"
          ? [{ kind: "tool_call", id: block.id, name: block.name, input: block.input }]
          : [],
      );
    }
    case "user": {
      return userEvents(line.message.content, line.tool_use_result);
    }
    case "stream_event": {
      const text = line.event.delta?.text;
      return line.event.type === "content_block_delta" &&
        line.event.delta?.type === "text_delta" &&
        text !== undefined
        ? [{ kind: "text_delta", text }]
        : [];
    }
    case "rate_limit_event": {
      const windows = line.rate_limit_info.unifiedWindows;
      return [
        {
          kind: "plan_window",
          fiveHour: windowOf(windows?.five_hour),
          sevenDay: windowOf(windows?.seven_day),
        },
      ];
    }
    case "tool_progress": {
      return [];
    }
    case "result": {
      return resultEvents(line);
    }
  }
  return [];
}
