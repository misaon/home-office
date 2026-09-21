import { z } from "zod";

export const TextBlock = z.object({ type: z.literal("text"), text: z.string() });

export const ContentBlock = z.discriminatedUnion("type", [
  TextBlock,
  z.object({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.unknown() }),
  z.object({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z.union([z.string(), z.array(z.unknown())]).optional(),
    is_error: z.boolean().optional(),
  }),
  z.object({ type: z.literal("thinking") }).loose(),
]);

export const Usage = z.object({
  input_tokens: z.int().nonnegative().default(0),
  output_tokens: z.int().nonnegative().default(0),
  cache_creation_input_tokens: z.int().nonnegative().default(0),
  cache_read_input_tokens: z.int().nonnegative().default(0),
  output_tokens_details: z
    .object({ thinking_tokens: z.int().nonnegative().default(0) })
    .loose()
    .optional(),
});

export const ModelUsage = z.record(
  z.string(),
  z.object({ costBasis: z.string().optional() }).loose(),
);

export const RateWindow = z.object({
  utilization: z.number().nullable().optional(),
  resetsAt: z.number().nullable().optional(),
});

export const SystemLine = z.object({
  type: z.literal("system"),
  subtype: z.string(),
  session_id: z.string().optional(),
  model: z.string().optional(),
  claude_code_version: z.string().optional(),
  tools: z.array(z.string()).optional(),
  plugins: z.array(z.object({ name: z.string() })).optional(),
  plugin_errors: z.array(z.object({ plugin: z.string(), message: z.string() })).optional(),
  mcp_servers: z.array(z.object({ name: z.string(), status: z.string().optional() })).optional(),
  error: z.string().optional(),
  retry_delay_ms: z.int().optional(),
  attempt: z.int().optional(),
  task_id: z.string().optional(),
  tool_use_id: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
});

export const ResultLine = z.object({
  type: z.literal("result"),
  subtype: z.string(),
  is_error: z.boolean(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  session_id: z.string(),
  num_turns: z.int(),
  usage: Usage.optional(),
  total_cost_usd: z.number().nonnegative().optional(),
  duration_ms: z.int().nonnegative().optional(),
  duration_api_ms: z.int().nonnegative().optional(),
  ttft_ms: z.int().nonnegative().optional(),
  modelUsage: ModelUsage.optional(),
});

export const StreamLine = z.discriminatedUnion("type", [
  SystemLine,
  z.object({ type: z.literal("assistant"), message: z.object({ content: z.array(ContentBlock) }) }),
  z.object({
    type: z.literal("user"),
    message: z.object({ content: z.union([z.string(), z.array(ContentBlock)]) }),
    tool_use_result: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("stream_event"),
    event: z.object({
      type: z.string(),
      delta: z.object({ type: z.string(), text: z.string().optional() }).optional(),
    }),
  }),
  z.object({
    type: z.literal("rate_limit_event"),
    rate_limit_info: z
      .object({
        unifiedWindows: z
          .object({ five_hour: RateWindow.optional(), seven_day: RateWindow.optional() })
          .optional(),
      })
      .loose(),
  }),
  z.object({ type: z.literal("tool_progress") }).loose(),
  ResultLine,
]);

export type ContentBlock = z.infer<typeof ContentBlock>;
export type SystemLine = z.infer<typeof SystemLine>;
export type ResultLine = z.infer<typeof ResultLine>;
export type RateWindow = z.infer<typeof RateWindow>;
export type ModelUsage = z.infer<typeof ModelUsage>;
