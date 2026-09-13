import { type Actor, errorMessage, type HoReportInput } from "@ho/protocol";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Logger } from "./logger.ts";
import { type Entry, type McpSessionContext, text, TOOLS, type ToolResult } from "./mcp-tools.ts";
import type { Office } from "./office.ts";
import { bearerToken, mintToken } from "./token.ts";
import { VERSION } from "./version.ts";

export class McpGateway {
  readonly #entries = new Map<string, Entry>();
  readonly #office: Office;
  readonly #log: Logger;

  constructor(office: Office, log: Logger) {
    this.#office = office;
    this.#log = log;
  }

  static readonly path = "/mcp";

  register(ctx: McpSessionContext): string {
    const token = mintToken();
    this.#entries.set(token, { ctx, replied: false, report: null });
    return token;
  }

  unregister(token: string): void {
    this.#entries.delete(token);
  }

  /** Whether the agent already spoke in chat during this session (avoids a duplicate final reply). */
  replied(token: string): boolean {
    return this.#entries.get(token)?.replied ?? false;
  }

  report(token: string): HoReportInput | null {
    return this.#entries.get(token)?.report ?? null;
  }

  async handle(req: Request): Promise<Response> {
    const token = bearerToken(req);
    const entry = token === null ? undefined : this.#entries.get(token);
    if (entry === undefined) {
      return new Response("unauthorized", { status: 401 });
    }
    const server = this.#build(entry);
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(req);
    } finally {
      await server.close().catch(() => null);
    }
  }

  #build(entry: Entry): McpServer {
    const server = new McpServer({ name: "home-office", version: VERSION });
    const actor: Actor = { kind: "agent", agentId: entry.ctx.agentId };
    for (const tool of TOOLS) {
      if (!tool.modes.includes(entry.ctx.mode)) {
        continue;
      }
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.shape },
        async (input: unknown): Promise<ToolResult> => {
          try {
            return text(await tool.handle(input, this.#office, entry, actor));
          } catch (error) {
            const message = errorMessage(error);
            this.#log.warn({ sessionId: entry.ctx.sessionId, err: message }, "mcp tool rejected");
            return { content: [{ type: "text", text: message }], isError: true };
          }
        },
      );
    }
    return server;
  }
}
