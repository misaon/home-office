import { compact, type LiveEvent, type RuntimeEvent, SessionId } from "@ho/protocol";
import { type Command, output } from "../cli.ts";
import { line, print } from "../output.ts";
import { pick } from "./lookup.ts";

type Described = Exclude<RuntimeEvent, { kind: "text_delta" }>;

const FORMAT: {
  [K in Described["kind"]]: (e: Extract<Described, { kind: K }>, tag: string) => string;
} = {
  tool_call: (e, tag) => `${tag} ▶ ${e.name} ${JSON.stringify(e.input).slice(0, 160)}`,
  tool_result: (e, tag) => `${tag} ${e.ok ? "✔" : "✖"} ${e.summary}`,
  result: (e, tag) =>
    e.ok
      ? `${tag} result ok=true turns=${String(e.turns)}`
      : `${tag} result ok=false turns=${String(e.turns)}\n${tag} ${e.text.slice(0, 1000)}`,
  usage: (e, tag) => `${tag} usage ${JSON.stringify(e.usage)}`,
  context: (e, tag) =>
    `${tag} context ${String(e.usedTokens)}/${String(e.windowTokens)}${e.cost === null ? "" : ` cost ${e.cost.amount.toFixed(2)} ${e.cost.currency}`}`,
  rate_limited: (e, tag) => `${tag} rate limited until ${e.retryAt ?? "?"}`,
  error: (e, tag) => `${tag} error ${e.code}: ${e.message}`,
  permission_request: (e, tag) => `${tag} permission requested for ${e.tool}`,
  init: (e, tag) =>
    `${tag} init model=${e.model}${e.effort === undefined ? "" : ` effort=${e.effort}`} tools=${String(e.tools)} plugins=[${e.plugins.join(", ")}] mcp=[${e.mcpServers.join(", ")}]${e.pluginErrors.length > 0 ? ` plugin-errors=${e.pluginErrors.join("; ")}` : ""}`,
};

const describe = <K extends Described["kind"]>(
  e: Extract<Described, { kind: K }>,
  tag: string,
): string =>
  (FORMAT[e.kind] as (event: Extract<Described, { kind: K }>, tag: string) => string)(e, tag);

const tagOf = (live: LiveEvent): string => `[${live.sessionId.slice(-8)}]`;

class Multiplexer {
  readonly #partial = new Map<string, string>();
  readonly #tagged: boolean;

  constructor(tagged: boolean) {
    this.#tagged = tagged;
  }

  feed(live: LiveEvent): void {
    const { event } = live;
    if (event.kind === "text_delta") {
      this.#text(live, event.text);
      return;
    }
    this.flush(live.sessionId);
    const text = describe(event, this.#tagged ? tagOf(live) : "");
    line(this.#tagged ? text : text.trimStart());
  }

  flush(sessionId?: string): void {
    for (const [id, pending] of this.#partial) {
      if ((sessionId === undefined || id === sessionId) && pending !== "") {
        line(this.#tagged ? `[${id.slice(-8)}] ${pending}` : pending);
        this.#partial.set(id, "");
      }
    }
  }

  #text(live: LiveEvent, text: string): void {
    if (!this.#tagged) {
      process.stdout.write(text);
      return;
    }
    const pending = (this.#partial.get(live.sessionId) ?? "") + text;
    const lines = pending.split("\n");
    const rest = lines.pop() ?? "";
    for (const complete of lines) {
      line(`${tagOf(live)} ${complete}`);
    }
    this.#partial.set(live.sessionId, rest);
  }
}

export const sessionCommand: Command = {
  name: "session",
  summary:
    "agent sessions; watch streams live runtime events, and watching all of them prefixes every line with the session",
  subcommands: {
    list: {
      run: async (_parsed, client) => {
        const rpc = await client();
        const sessions = await rpc.sessions.list({});
        return output(
          sessions.map(
            (s) =>
              `${s.id}  ${s.state.padEnd(9)}  task=${s.taskId.slice(-8)}  agent=${s.agentId.slice(-8)}  turns=${String(s.usage.turns)}  ${String(s.usage.inputTokens)}in/${String(s.usage.outputTokens)}out/${String(s.usage.cacheReadTokens)}cache${s.services === undefined ? "" : `  services=${s.services}`}${s.runtime === undefined ? "" : `  ran=${s.runtime.confirmedModel ?? s.runtime.model}/${s.runtime.confirmedEffort ?? s.runtime.effort}`}`,
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
        const multiplexer = new Multiplexer(sessionId === undefined);
        try {
          for await (const live of await rpc.sessions.stream(compact({ sessionId }))) {
            multiplexer.feed(live);
          }
        } finally {
          multiplexer.flush();
        }
        return undefined;
      },
    },
  },
};
