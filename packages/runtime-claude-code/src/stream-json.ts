// Claude Code `--output-format stream-json` events, validated loosely: only the fields we consume.
import type { RuntimeErrorCode, RuntimeEvent } from "@ho/core";
import { z } from "zod";

const ContentBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.unknown() }),
  z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z.union([z.string(), z.array(z.unknown())]).optional(),
    is_error: z.boolean().optional(),
  }),
  z.object({ type: z.literal("thinking") }).loose(),
]);

const Usage = z.object({
  input_tokens: z.int().nonnegative().default(0),
  output_tokens: z.int().nonnegative().default(0),
  cache_creation_input_tokens: z.int().nonnegative().default(0),
  cache_read_input_tokens: z.int().nonnegative().default(0),
});

export const StreamLine = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("system"),
    subtype: z.string(),
    session_id: z.string().optional(),
    model: z.string().optional(),
    tools: z.array(z.string()).optional(),
    plugins: z.array(z.object({ name: z.string() })).optional(),
    plugin_errors: z.array(z.object({ plugin: z.string(), message: z.string() })).optional(),
    mcp_servers: z.array(z.object({ name: z.string(), status: z.string().optional() })).optional(),
    error: z.string().optional(),
    retry_delay_ms: z.int().optional(),
    attempt: z.int().optional(),
  }),
  z.object({ type: z.literal("assistant"), message: z.object({ content: z.array(ContentBlock) }) }),
  z.object({
    type: z.literal("user"),
    message: z.object({ content: z.union([z.string(), z.array(ContentBlock)]) }),
  }),
  z.object({
    type: z.literal("stream_event"),
    event: z.object({
      type: z.string(),
      delta: z.object({ type: z.string(), text: z.string().optional() }).optional(),
    }),
  }),
  z.object({
    type: z.literal("result"),
    subtype: z.string(),
    is_error: z.boolean(),
    result: z.string().optional(),
    structured_output: z.unknown().optional(),
    session_id: z.string(),
    num_turns: z.int(),
    usage: Usage.optional(),
  }),
]);
export type StreamLine = z.infer<typeof StreamLine>;

const SUMMARY_MAX = 200;
const summarize = (content: string | unknown[] | undefined): string => {
  if (content === undefined) {
    return "";
  }
  const text =
    typeof content === "string"
      ? content
      : content
          .map((block) => {
            const parsed = z.object({ type: z.literal("text"), text: z.string() }).safeParse(block);
            return parsed.success ? parsed.data.text : "";
          })
          .join(" ");
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;
};

const RETRY_ERROR_CODES: Readonly<Record<string, RuntimeErrorCode>> = {
  authentication_failed: "authentication_failed",
  oauth_org_not_allowed: "authentication_failed",
  billing_error: "billing_error",
  rate_limit: "rate_limit",
  model_not_found: "model_not_found",
  invalid_request: "invalid_request",
  server_error: "server_error",
  overloaded: "server_error",
};

/** Parses one stdout line. Returns the normalised events it implies; unknown lines yield nothing. */
export function normalizeLine(raw: string, now: () => Date): RuntimeEvent[] {
  if (!raw.startsWith("{")) {
    return [];
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  const parsed = StreamLine.safeParse(json);
  if (!parsed.success) {
    return [];
  }
  const line = parsed.data;
  switch (line.type) {
    case "system": {
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
      if (
        line.subtype === "api_retry" &&
        line.error !== undefined &&
        line.error in RETRY_ERROR_CODES &&
        line.error !== "rate_limit"
      ) {
        const code = RETRY_ERROR_CODES[line.error] ?? "unknown";
        return code === "server_error"
          ? []
          : [{ kind: "error", code, message: `api retry: ${line.error}` }];
      }
      return [];
    }
    case "assistant": {
      return line.message.content.flatMap((block): RuntimeEvent[] =>
        block.type === "tool_use"
          ? [{ kind: "tool_call", id: block.id, name: block.name, input: block.input }]
          : [],
      );
    }
    case "user": {
      if (typeof line.message.content === "string") {
        return [];
      }
      return line.message.content.flatMap((block): RuntimeEvent[] =>
        block.type === "tool_result"
          ? [
              {
                kind: "tool_result",
                id: block.tool_use_id,
                ok: block.is_error !== true,
                summary: summarize(block.content),
              },
            ]
          : [],
      );
    }
    case "stream_event": {
      const text = line.event.delta?.text;
      return line.event.type === "content_block_delta" &&
        line.event.delta?.type === "text_delta" &&
        text !== undefined
        ? [{ kind: "text_delta", text }]
        : [];
    }
    case "result": {
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
          },
        },
      ];
      if (line.is_error && line.subtype === "error_max_turns") {
        events.push({ kind: "error", code: "max_turns", message: "turn budget exhausted" });
      }
      events.push({
        kind: "result",
        ok: !line.is_error,
        text: line.result ?? "",
        ...(line.structured_output === undefined ? {} : { structured: line.structured_output }),
        turns: line.num_turns,
        runtimeSessionId: line.session_id,
      });
      return events;
    }
  }
  return [];
}
