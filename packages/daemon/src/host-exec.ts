import { compact } from "@ho/protocol";
import { daemonLog } from "./logger.ts";

export type Exec = { code: number; stdout: string; stderr: string };

const TAIL = 400;

type ExecOptions = { cwd?: string | undefined; timeoutMs: number; env?: Record<string, string> };

const redact = (text: string): string => text.replaceAll(/\/\/[^\s/@]+@/gu, "//***@");

export async function exec(argv: readonly string[], options: ExecOptions): Promise<Exec> {
  const started = Bun.nanoseconds();
  const proc = Bun.spawn([...argv], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: options.timeoutMs,
    env: { ...Bun.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0", ...options.env },
    ...compact({ cwd: options.cwd }),
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const result = { code, stdout: stdout.trim(), stderr: redact(stderr.trim()) };
  daemonLog()?.debug(
    {
      argv: argv.map((part) => redact(part)),
      ...compact({ cwd: options.cwd }),
      code,
      ms: Math.round((Bun.nanoseconds() - started) / 1e6),
      stdout: result.stdout.slice(0, TAIL),
      stderr: result.stderr.slice(0, TAIL),
    },
    "host command",
  );
  return result;
}

export async function mustExec(
  argv: readonly string[],
  options: ExecOptions,
  what: string,
): Promise<string> {
  const result = await exec(argv, options);
  if (result.code !== 0) {
    throw new Error(
      `${what} failed (${String(result.code)}): ${(result.stderr || result.stdout).slice(0, 500)}`,
    );
  }
  return result.stdout;
}
