// ho-runner: PID 1 inside an agent sandbox. Dials the daemon's runner gateway over WebSocket with a
// one-time token, then relays exactly one child process (stdin/stdout lines/stderr/exit). The agent's
// credentials arrive over this channel and only ever live in the child's environment.
import { type FromRunner, RUNNER_ENV, RUNNER_PATH, ToRunner } from "@ho/protocol";

const gateway = Bun.env[RUNNER_ENV.gateway];
const token = Bun.env[RUNNER_ENV.token];
if (gateway === undefined || token === undefined) {
  process.stderr.write(`${RUNNER_ENV.gateway} and ${RUNNER_ENV.token} are required\n`);
  process.exit(2);
}

const ws = new WebSocket(`${gateway}${RUNNER_PATH}`, {
  headers: { authorization: `Bearer ${token}` },
});
const send = (message: FromRunner): void => {
  ws.send(JSON.stringify(message));
};
const reportError = (error: unknown): void => {
  send({ type: "error", message: error instanceof Error ? error.message : String(error) });
};
// FileSink operations may return a promise when the pipe is backed up; never leave it floating.
const settle = (result: number | Promise<number>): void => {
  if (result instanceof Promise) {
    result.catch(reportError);
  }
};

type Child = Bun.Subprocess<"pipe", "pipe", "pipe">;
let child: Child | undefined;

async function pumpLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      onLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer.length > 0) {
    onLine(buffer);
  }
}

async function pumpText(
  stream: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    onText(decoder.decode(chunk, { stream: true }));
  }
}

async function relayExit(proc: Child): Promise<void> {
  const code = await proc.exited;
  send({ type: "exit", code, signal: proc.signalCode });
  child = undefined;
}

function spawnChild(
  argv: readonly string[],
  env: Readonly<Record<string, string>>,
  cwd: string | undefined,
): void {
  if (child !== undefined) {
    send({ type: "error", message: "a child process is already running" });
    return;
  }
  const proc = Bun.spawn([...argv], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...Bun.env, ...env },
    ...(cwd === undefined ? {} : { cwd }),
  });
  child = proc;
  send({ type: "spawned", pid: proc.pid });
  pumpLines(proc.stdout, (line) => {
    send({ type: "stdout", line });
  }).catch(reportError);
  pumpText(proc.stderr, (text) => {
    send({ type: "stderr", text });
  }).catch(reportError);
  relayExit(proc).catch(reportError);
}

function handle(message: ToRunner): void {
  switch (message.type) {
    case "spawn": {
      spawnChild(message.argv, message.env, message.cwd);
      break;
    }
    case "stdin": {
      if (child !== undefined) {
        settle(child.stdin.write(message.data));
        settle(child.stdin.flush());
      }
      break;
    }
    case "stdin_close": {
      if (child !== undefined) {
        settle(child.stdin.end());
      }
      break;
    }
    case "signal": {
      child?.kill(message.signal);
      break;
    }
    case "shutdown": {
      child?.kill("SIGTERM");
      ws.close();
      break;
    }
  }
}

ws.addEventListener("open", () => {
  send({
    type: "hello",
    hostname: Bun.env["HOSTNAME"] ?? "unknown",
    uid: process.getuid?.() ?? -1,
    cwd: process.cwd(),
    bunVersion: Bun.version,
  });
});
ws.addEventListener("message", (event) => {
  const data: unknown = event.data;
  if (typeof data !== "string") {
    send({ type: "error", message: "binary frames are not supported" });
    return;
  }
  try {
    handle(ToRunner.parse(JSON.parse(data)));
  } catch (error) {
    reportError(error);
  }
});
ws.addEventListener("close", () => {
  child?.kill("SIGTERM");
  process.exit(0);
});
ws.addEventListener("error", () => {
  process.stderr.write("gateway connection failed\n");
  process.exit(1);
});
