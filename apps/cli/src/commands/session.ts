import { compact, type LiveEvent, type RuntimeEvent, SessionId } from "@ho/protocol";
import { type Command, output } from "../cli.ts";
import { line, print } from "../output.ts";
import { pick } from "./lookup.ts";

type Formatter<K extends RuntimeEvent["kind"]> = (
  event: Extract<RuntimeEvent, { kind: K }>,
  tag: string,
) => string | null;

const FORMAT: { [K in RuntimeEvent["kind"]]: Formatter<K> } = {
  text_delta: (e) => {
    process.stdout.write(e.text);
    return null;
  },
  tool_call: (e, tag) => `\n${tag} ▶ ${e.name} ${JSON.stringify(e.input).slice(0, 160)}`,
  tool_result: (e, tag) => `${tag} ${e.ok ? "✔" : "✖"} ${e.summary}`,
  result: (e, tag) =>
    e.ok
      ? `\n${tag} result ok=true turns=${String(e.turns)}`
      : `\n${tag} result ok=false turns=${String(e.turns)}\n${tag} ${e.text.slice(0, 1000)}`,
  usage: (e, tag) => `${tag} usage ${JSON.stringify(e.usage)}`,
  context: (e, tag) =>
    `${tag} context ${String(e.usedTokens)}/${String(e.windowTokens)}${e.cost === null ? "" : ` cost ${e.cost.amount.toFixed(2)} ${e.cost.currency}`}`,
  rate_limited: (e, tag) => `${tag} rate limited until ${e.retryAt ?? "?"}`,
  error: (e, tag) => `${tag} error ${e.code}: ${e.message}`,
  permission_request: (e, tag) => `${tag} permission requested for ${e.tool}`,
  init: (e, tag) =>
    `${tag} init model=${e.model} tools=${String(e.tools)} plugins=[${e.plugins.join(", ")}] mcp=[${e.mcpServers.join(", ")}]${e.pluginErrors.length > 0 ? ` plugin-errors=${e.pluginErrors.join("; ")}` : ""}`,
};

const describe = <K extends RuntimeEvent["kind"]>(
  live: LiveEvent & {
    event: Extract<RuntimeEvent, { kind: K }>;
  },
): string | null =>
  (FORMAT[live.event.kind] as Formatter<K>)(live.event, `[${live.sessionId.slice(-8)}]`);

export const sessionCommand: Command = {
  name: "session",
  summary: "agent sessions; watch streams live runtime events",
  subcommands: {
    list: {
      run: async (_parsed, client) => {
        const rpc = await client();
        const sessions = await rpc.sessions.list({});
        return output(
          sessions.map(
            (s) =>
              `${s.id}  ${s.state.padEnd(9)}  task=${s.taskId.slice(-8)}  agent=${s.agentId.slice(-8)}  turns=${String(s.usage.turns)}  ${String(s.usage.inputTokens)}in/${String(s.usage.outputTokens)}out/${String(s.usage.cacheReadTokens)}cache${s.services === undefined ? "" : `  services=${s.services}`}`,
          ),
          sessions,
        );
      },
    },
    show: {
      positionals: ["<session-id>"],
      run: async (parsed, client) => {
        const ref = parsed.positionals[0] ?? "";
        const rpc = await client();
        const found = pick(await rpc.sessions.list({}), ref, "session");
        print(found);
        return undefined;
      },
    },
    watch: {
      positionals: ["[session-id|all]"],
      run: async (parsed, client) => {
        const [ref] = parsed.positionals;
        const sessionId = ref === undefined || ref === "all" ? undefined : SessionId.parse(ref);
        const rpc = await client();
        for await (const live of await rpc.sessions.stream(compact({ sessionId }))) {
          const text = describe(live);
          if (text !== null) {
            line(text);
          }
        }
        return undefined;
      },
    },
  },
};
