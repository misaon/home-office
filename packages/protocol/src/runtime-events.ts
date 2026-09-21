import { z } from "zod";
import { IsoDateTime, Usage } from "./domain.ts";
import { SessionId } from "./ids.ts";
import { PlanWindow } from "./plan-usage.ts";

export const RuntimeErrorCode = z.enum([
  "authentication_failed",
  "billing_error",
  "rate_limit",
  "model_not_found",
  "invalid_request",
  "server_error",
  "max_turns",
  "process_exit",
  "protocol",
  "unknown",
]);
export type RuntimeErrorCode = z.infer<typeof RuntimeErrorCode>;

export const RuntimeEvent = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("init"),
    runtimeSessionId: z.string(),
    model: z.string(),
    effort: z.string().optional(),
    plugins: z.array(z.string()),
    pluginErrors: z.array(z.string()),
    tools: z.int().nonnegative(),
    mcpServers: z.array(z.string()),
  }),
  z.object({ kind: z.literal("text_delta"), text: z.string() }),
  z.object({ kind: z.literal("tool_call"), id: z.string(), name: z.string(), input: z.unknown() }),
  z.object({
    kind: z.literal("tool_result"),
    id: z.string(),
    ok: z.boolean(),
    summary: z.string(),
  }),
  z.object({
    kind: z.literal("permission_request"),
    id: z.string(),
    tool: z.string(),
    input: z.unknown(),
  }),
  z.object({
    kind: z.literal("file_change"),
    id: z.string(),
    path: z.string(),
    before: z.string().nullable(),
    after: z.string(),
    truncated: z.boolean(),
  }),
  z.object({
    kind: z.literal("usage"),
    usage: Usage,
    costUsd: z.number().nonnegative().optional(),
    costBasis: z.string().optional(),
    ttftMs: z.int().nonnegative().optional(),
    wallMs: z.int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("context"),
    usedTokens: z.int().nonnegative(),
    windowTokens: z.int().nonnegative(),
    cost: z.object({ amount: z.number(), currency: z.string() }).nullable(),
  }),
  z.object({ kind: z.literal("rate_limited"), retryAt: IsoDateTime.nullable() }),
  z.object({
    kind: z.literal("background_done"),
    id: z.string(),
    status: z.string(),
    exitCode: z.int().nullable(),
    summary: z.string(),
  }),
  z.object({
    kind: z.literal("plan_window"),
    fiveHour: PlanWindow.nullable(),
    sevenDay: PlanWindow.nullable(),
  }),
  z.object({
    kind: z.literal("result"),
    ok: z.boolean(),
    text: z.string(),
    structured: z.unknown().optional(),
    turns: z.int().nonnegative(),
    runtimeSessionId: z.string().nullable(),
  }),
  z.object({ kind: z.literal("error"), code: RuntimeErrorCode, message: z.string() }),
]);
export type RuntimeEvent = z.infer<typeof RuntimeEvent>;

const FILE_CHANGE_MAX_CHARS = 100_000;

const clipFile = (text: string): string =>
  text.length <= FILE_CHANGE_MAX_CHARS ? text : text.slice(0, FILE_CHANGE_MAX_CHARS);

export const fileChangeEvent = (
  id: string,
  path: string,
  before: string | null,
  after: string,
): Extract<RuntimeEvent, { kind: "file_change" }> => ({
  kind: "file_change",
  id,
  path,
  before: before === null ? null : clipFile(before),
  after: clipFile(after),
  truncated: (before?.length ?? 0) > FILE_CHANGE_MAX_CHARS || after.length > FILE_CHANGE_MAX_CHARS,
});

export const LiveEvent = z.object({ sessionId: SessionId, at: IsoDateTime, event: RuntimeEvent });
export type LiveEvent = z.infer<typeof LiveEvent>;

export const ProviderHealth = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    version: z.string(),
    apiVersion: z.string(),
    os: z.string(),
    arch: z.string(),
  }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export type ProviderHealth = z.infer<typeof ProviderHealth>;

const ResourceSnapshot = z.object({
  containers: z.int().nonnegative(),
  volumes: z.int().nonnegative(),
  imagesBytes: z.int().nonnegative(),
  volumesBytes: z.int().nonnegative(),
});
type ResourceSnapshot = z.infer<typeof ResourceSnapshot>;

export const ResourceInventory = z.object({
  snapshot: ResourceSnapshot,
  containers: z.array(
    z.object({
      name: z.string(),
      state: z.string(),
      kind: z.string(),
      sessionId: z.string().nullable(),
      createdAt: IsoDateTime,
    }),
  ),
  volumes: z.array(
    z.object({
      name: z.string(),
      kind: z.string(),
      sessionId: z.string().nullable(),
      createdAt: IsoDateTime.nullable(),
      sizeBytes: z.int().nonnegative().nullable(),
    }),
  ),
});
export type ResourceInventory = z.infer<typeof ResourceInventory>;

export const Doctor = z.object({
  provider: ProviderHealth,
  images: z.array(z.object({ ref: z.string(), present: z.boolean(), upToDate: z.boolean() })),
  imageContexts: z.boolean(),
  secrets: z.object({ anthropicOauthToken: z.boolean() }),
  sessions: z.object({ active: z.int().nonnegative(), max: z.int().positive() }),
  resources: ResourceSnapshot.nullable(),
});
export type Doctor = z.infer<typeof Doctor>;
