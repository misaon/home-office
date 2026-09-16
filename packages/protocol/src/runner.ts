import { z } from "zod";

export const ToRunner = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("spawn"),
    argv: z.array(z.string()).min(1),
    env: z.record(z.string(), z.string()),
    cwd: z.string().optional(),
  }),
  z.object({ type: z.literal("stdin"), data: z.string() }),
  z.object({ type: z.literal("stdin_close") }),
  z.object({ type: z.literal("signal"), signal: z.enum(["SIGINT", "SIGTERM", "SIGKILL"]) }),
]);
export type ToRunner = z.infer<typeof ToRunner>;

export const FromRunner = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), uid: z.int() }),
  z.object({ type: z.literal("spawned") }),
  z.object({ type: z.literal("stdout"), text: z.string() }),
  z.object({ type: z.literal("stderr"), text: z.string() }),
  z.object({ type: z.literal("exit"), code: z.int().nullable() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type FromRunner = z.infer<typeof FromRunner>;

export const RUNNER_PATH = "/runner";
export const RUNNER_ENV = { gateway: "HO_GATEWAY", token: "HO_SESSION_TOKEN" } as const;
