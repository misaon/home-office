import { SessionId } from "@ho/protocol";
import { withClient } from "../client.ts";
import { line, print } from "../output.ts";
import { subcommand } from "./usage.ts";

export async function session(args: readonly string[]): Promise<void> {
  const { sub, rest } = subcommand(args, "session");
  await withClient(async (client) => {
    switch (sub) {
      case "list": {
        for (const s of await client.sessions.list({})) {
          const usage = `${String(s.usage.inputTokens)}in/${String(s.usage.outputTokens)}out/${String(s.usage.cacheReadTokens)}cache`;
          line(
            `${s.id}  ${s.state.padEnd(9)}  task=${s.taskId.slice(-8)}  agent=${s.agentId.slice(-8)}  turns=${String(s.usage.turns)}  ${usage}`,
          );
        }
        return;
      }
      case "watch": {
        const ref = rest[0];
        const sessionId = ref === undefined || ref === "all" ? undefined : SessionId.parse(ref);
        const stream = await client.sessions.stream(sessionId === undefined ? {} : { sessionId });
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
          }
        }
        return;
      }
      case "show": {
        const ref = rest[0];
        if (ref === undefined) {
          throw new Error("session id is required");
        }
        const found = (await client.sessions.list({})).find(
          (s) => s.id === ref || s.id.endsWith(ref),
        );
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
