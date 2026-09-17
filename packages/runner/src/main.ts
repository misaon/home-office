import { compact, errorMessage } from "@ho/protocol";
import { type FromRunner, RUNNER_ENV, RUNNER_PATH, ToRunner } from "@ho/protocol/runner";
import { pumpLines, pumpText } from "./pump.ts";

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
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  if (ws.bufferedAmount > 4 * 1024 * 1024) {
    child?.kill("SIGKILL");
    ws.close(1013, "daemon is not consuming output");
    return;
  }
  ws.send(JSON.stringify(message));
};
const reportError = (error: unknown): void => {
  send({ type: "error", message: errorMessage(error) });
};
const settle = (result: number | Promise<number>): void => {
  if (result instanceof Promise) {
    result.catch(reportError);
  }
};

type Child = Bun.Subprocess<"pipe", "pipe", "pipe">;
let child: Child | undefined;

async function relayExit(proc: Child, output: Promise<unknown>): Promise<void> {
  const code = await proc.exited;
  if (child === proc) {
    child = undefined;
  }
  await output;
  send({ type: "exit", code });
}

async function spawnChild(
  argv: readonly string[],
  env: Readonly<Record<string, string>>,
  cwd: string | undefined,
): Promise<void> {
  const previous = child;
  if (previous !== undefined) {
    previous.kill("SIGKILL");
    await previous.exited;
  }
  const proc = Bun.spawn([...argv], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...Bun.env, [RUNNER_ENV.token]: undefined, [RUNNER_ENV.gateway]: undefined, ...env },
    ...compact({ cwd }),
  });
  child = proc;
  send({ type: "spawned" });
  const stdout = pumpLines(
    proc.stdout,
    (text) => {
      send({ type: "stdout", text });
    },
    () => {
      proc.kill("SIGKILL");
    },
  ).catch(reportError);
  const stderr = pumpText(proc.stderr, (text) => {
    send({ type: "stderr", text });
  }).catch(reportError);
  relayExit(proc, Promise.allSettled([stdout, stderr])).catch(reportError);
}

function handle(message: ToRunner): void {
  switch (message.type) {
    case "spawn": {
      spawnChild(message.argv, message.env, message.cwd).catch(reportError);
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
  send({ type: "hello", uid: process.getuid?.() ?? -1 });
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
