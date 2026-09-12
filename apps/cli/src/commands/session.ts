import { type Command, subcommand } from "../command.ts";
import { compact, SessionId } from "@ho/protocol";
import { withClient } from "../client.ts";
import { line, print } from "../output.ts";

async function session(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, sessionCommand);
  await withClient(async (client) => {
    switch (sub) {
      case "list": {
        for (const s of await client.sessions.list({})) {
          const usage = `${String(s.usage.inputTokens)}in/${String(s.usage.outputTokens)}out/${String(s.usage.cacheReadTokens)}cache`;
          const services = s.services === undefined ? "" : `  services=${s.services}`;
          line(
            `${s.id}  ${s.state.padEnd(9)}  task=${s.taskId.slice(-8)}  agent=${s.agentId.slice(-8)}  turns=${String(s.usage.turns)}  ${usage}${services}`,
          );
        }
        return;
      }
      case "watch": {
        const ref = rest[0];
        const sessionId = ref === undefined || ref === "all" ? undefined : SessionId.parse(ref);
        const stream = await client.sessions.stream(compact({ sessionId }));
        for await (const live of stream) {
          const e = live.event;
          switch (e.kind) {
            case "text_delta": {
              process.stdout.write(e.text);
              break;
            }
            case "tool_call": {
              line(
                `\n[${live.sessionId.slice(-8)}] ▶ ${e.name} ${JSON.stringify(e.input).slice(0, 160)}`,
              );
              break;
            }
            case "tool_result": {
              line(`[${live.sessionId.slice(-8)}] ${e.ok ? "✔" : "✖"} ${e.summary}`);
              break;
            }
            case "result": {
              line(
                `\n[${live.sessionId.slice(-8)}] result ok=${String(e.ok)} turns=${String(e.turns)}`,
              );
              break;
            }
            case "usage": {
              line(`[${live.sessionId.slice(-8)}] usage ${JSON.stringify(e.usage)}`);
              break;
            }
            case "context": {
              line(
                `[${live.sessionId.slice(-8)}] context ${String(e.usedTokens)}/${String(e.windowTokens)}${e.cost === null ? "" : ` cost ${e.cost.amount.toFixed(2)} ${e.cost.currency}`}`,
              );
              break;
            }
            case "rate_limited": {
              line(`[${live.sessionId.slice(-8)}] rate limited until ${e.retryAt ?? "?"}`);
              break;
            }
            case "error": {
              line(`[${live.sessionId.slice(-8)}] error ${e.code}: ${e.message}`);
              break;
            }
            case "permission_request": {
              line(`[${live.sessionId.slice(-8)}] permission requested for ${e.tool}`);
              break;
            }
            case "init": {
              line(
                `[${live.sessionId.slice(-8)}] init model=${e.model} tools=${String(e.tools)} plugins=[${e.plugins.join(", ")}] mcp=[${e.mcpServers.join(", ")}]${e.pluginErrors.length > 0 ? ` plugin-errors=${e.pluginErrors.join("; ")}` : ""}`,
              );
              break;
            }
          }
        }
        return;
      }
      case "show": {
        const ref = rest[0];
        if (ref === undefined) {
          throw new Error("session id is required");
        }
        const matches = (await client.sessions.list({})).filter(
          (s) => s.id === ref || s.id.endsWith(ref),
        );
        if (matches.length > 1) {
          throw new Error(`session "${ref}" is ambiguous; use its full id`);
        }
        const found = matches[0];
        if (found === undefined) {
          throw new Error(`session "${ref}" not found`);
        }
        print(found);
        return;
      }
      default: {
        throw new Error(`unknown session command "${sub}"`);
      }
    }
  });
}

export const sessionCommand: Command = {
  name: "session",
  summary: "agent sessions; watch streams live runtime events",
  usage: ["  ho session list | show <id> | watch [<session-id>|all]"],
  run: session,
};
