// Drives @ho/runtime-acp against the mock agent through a local stand-in for the runner relay: the same
// RunnerChannel contract the daemon uses, but the child is a Bun subprocess on this machine instead of a
// process inside a sandbox. Prints every runtime event and checks the ones that matter.
import { createChannel, type RunnerChannel, type RunnerLine, type RuntimeEvent } from "@ho/core";
import { AgentId, compact, SessionId, TaskId } from "@ho/protocol";
import { pumpLines, pumpText } from "@ho/runner/pump";
import { createAcpRuntime } from "@ho/runtime-acp";

const here = import.meta.dir;

/** A RunnerChannel whose child runs locally; `lines()` is the same async channel the daemon's gateway uses. */
function localChannel(): RunnerChannel & { exited: Promise<number | null> } {
  let child: Bun.Subprocess<"pipe", "pipe", "pipe"> | undefined;
  const lines = createChannel<RunnerLine>();
  const exit = Promise.withResolvers<number | null>();
  return {
    exited: exit.promise,
    spawn: (argv, env, cwd) => {
      const proc = Bun.spawn([...argv], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: { ...Bun.env, ...env },
        ...compact({ cwd }),
      });
      child = proc;
      void pumpLines(proc.stdout, (text) => {
        lines.push({ stream: "stdout", text });
      });
      void pumpText(proc.stderr, (text) => {
        lines.push({ stream: "stderr", text });
      });
      void proc.exited.then((code) => {
        lines.push({ stream: "exit", code });
        lines.close();
        exit.resolve(code);
      });
      return Promise.resolve();
    },
    write: (data) => {
      void child?.stdin.write(data);
      void child?.stdin.flush();
    },
    closeStdin: () => {
      void child?.stdin.end();
    },
    signal: (signal) => {
      child?.kill(signal);
    },
    lines: () => lines.iterate(),
  };
}

const runtime = createAcpRuntime(
  {
    id: "opencode",
    name: "mock",
    argv: () => ["bun", `${here}/agent.ts`],
    env: () => ({}),
    authMethods: ["api-key"],
    resume: false,
  },
  {
    clientVersion: "0.0.0-spike",
    onStderr: (text) => {
      process.stderr.write(`[agent stderr] ${text}\n`);
    },
  },
);

const channel = localChannel();
const session = await runtime.open(
  {
    sessionId: SessionId.parse("01a07900-0000-7000-8000-000000000001"),
    taskId: TaskId.parse("01a07900-0000-7000-8000-000000000002"),
    agentId: AgentId.parse("01a07900-0000-7000-8000-000000000003"),
    provider: "opencode",
    auth: "api-key",
    model: "mock/model",
    effort: "medium",
    maxTurns: 10,
    maxUsd: null,
    systemPromptAppendix: "You are Pam, a worker at Home Office.",
    cwd: here,
    resume: null,
    pluginDirs: [],
    mcpServers: {
      ho: {
        kind: "http",
        url: "http://host.docker.internal:47800/mcp",
        headers: { Authorization: "Bearer x" },
      },
      playwright: { kind: "stdio", command: "node", args: ["cli.js"], env: {} },
    },
  },
  channel,
  { MOCK_API_KEY: "mock-secret" },
);

const describeEvent = (event: RuntimeEvent): string => {
  if (event.kind === "text_delta") {
    return `text_delta ${JSON.stringify(event.text)}`;
  }
  if (event.kind === "result") {
    return `result ok=${String(event.ok)} turns=${String(event.turns)} session=${String(event.runtimeSessionId)} text=${JSON.stringify(event.text)}`;
  }
  return `${event.kind} ${JSON.stringify(event)}`;
};

const events: RuntimeEvent[] = [];
for await (const event of session.prompt({ text: "Summarise the README." })) {
  events.push(event);
  process.stdout.write(`${describeEvent(event)}\n`);
}
await session.close();
const kinds = events.map((e) => e.kind);
const checks = {
  init: kinds[0] === "init",
  permission: kinds.includes("permission_request"),
  toolCall: kinds.includes("tool_call"),
  toolResultOk: events.some((e) => e.kind === "tool_result" && e.ok),
  result: events.some((e) => e.kind === "result" && e.ok && e.text.includes("2 MCP servers")),
  exitCode: await channel.exited,
};
process.stdout.write(`CHECKS ${JSON.stringify(checks)}\n`);
process.exit(Object.values(checks).every((v) => v === true || v === 0) ? 0 : 1);
