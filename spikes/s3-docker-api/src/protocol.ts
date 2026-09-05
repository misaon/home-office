import { z } from "zod";

// Messages from the daemon (gateway) to the in-container runner.
export const ToRunner = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("spawn"),
    argv: z.array(z.string()).min(1),
    env: z.record(z.string(), z.string()),
  }),
  z.object({ type: z.literal("stdin"), data: z.string() }),
  z.object({ type: z.literal("stdin_close") }),
  z.object({ type: z.literal("signal"), signal: z.enum(["SIGINT", "SIGTERM"]) }),
]);
export type ToRunner = z.infer<typeof ToRunner>;

// Messages from the runner back to the daemon.
export const FromRunner = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    hostname: z.string(),
    uid: z.number(),
    cwd: z.string(),
    bunVersion: z.string(),
  }),
  z.object({ type: z.literal("stdout"), line: z.string() }),
  z.object({ type: z.literal("stderr"), text: z.string() }),
  z.object({ type: z.literal("exit"), code: z.number().nullable() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type FromRunner = z.infer<typeof FromRunner>;

export function parseJson<T>(schema: z.ZodType<T>, raw: string | Buffer | Uint8Array): T {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  return schema.parse(JSON.parse(text));
}
