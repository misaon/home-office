// ho-runner spike: runs inside the container, dials the daemon gateway over WebSocket,
// spawns a child process on request and relays its stdin/stdout/stderr as JSON messages.
import { type FromRunner, parseJson, ToRunner } from "./protocol.ts";

const gateway = Bun.env["HO_GATEWAY"];
const token = Bun.env["HO_SESSION_TOKEN"];
if (gateway === undefined || token === undefined) {
  process.stderr.write("HO_GATEWAY and HO_SESSION_TOKEN are required\n");
  process.exit(2);
}

const ws = new WebSocket(`${gateway}/runner`, { headers: { authorization: `Bearer ${token}` } });
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

let child: Bun.Subprocess<"pipe", "pipe", "pipe"> | undefined;

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

async function relayExit(proc: Bun.Subprocess<"pipe", "pipe", "pipe">): Promise<void> {
  const code = await proc.exited;
  send({ type: "exit", code });
  ws.close();
}

function spawnChild(argv: readonly string[], env: Readonly<Record<string, string>>): void {
  if (child !== undefined) {
    send({ type: "error", message: "child already running" });
    return;
  }
  const proc = Bun.spawn([...argv], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...Bun.env, ...env },
  });
  child = proc;
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
      spawnChild(message.argv, message.env);
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
    handle(parseJson(ToRunner, data));
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
