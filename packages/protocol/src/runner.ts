import { z } from "zod";

/**
 * Wire protocol between the daemon's runner gateway and `ho-runner` inside a sandbox.
 * The runner dials out, authenticates with a one-time token, then relays one child process.
 */
export const RunnerHello = z.object({
  type: z.literal("hello"),
  hostname: z.string(),
  uid: z.int(),
  cwd: z.string(),
  bunVersion: z.string(),
});

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
  z.object({ type: z.literal("shutdown") }),
]);
export type ToRunner = z.infer<typeof ToRunner>;

export const FromRunner = z.discriminatedUnion("type", [
  RunnerHello,
  z.object({ type: z.literal("spawned"), pid: z.int() }),
  z.object({ type: z.literal("stdout"), line: z.string() }),
  z.object({ type: z.literal("stderr"), text: z.string() }),
  z.object({ type: z.literal("exit"), code: z.int().nullable(), signal: z.string().nullable() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type FromRunner = z.infer<typeof FromRunner>;
export type RunnerHello = z.infer<typeof RunnerHello>;

export const RUNNER_PATH = "/runner";
export const RUNNER_ENV = { gateway: "HO_GATEWAY", token: "HO_SESSION_TOKEN" } as const;
