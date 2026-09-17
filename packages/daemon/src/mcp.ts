import { type Actor, errorMessage, type HoReportInput, type SessionMode } from "@ho/protocol";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Logger } from "./logger.ts";
import { type Entry, type McpSessionContext, text, TOOLS, type ToolResult } from "./mcp-tools.ts";
import type { Office } from "./office.ts";
import type { SkillLibrary } from "./skills.ts";
import { bearerToken, mintToken } from "./token.ts";
import { VERSION } from "./version.ts";

const INSTRUCTIONS: Readonly<Record<SessionMode, string>> = {
  work: "Home Office tools for a work session. Commit on the task branch, then end with ho_report: status review when the work is ready, blocked with the reason when you cannot continue. ho_ask_human pauses the task for a human decision, ho_handoff passes it to a named colleague, ho_task_status returns the notes and artifacts when you lack context. The office pushes and opens pull requests itself.",
  review:
    "Home Office tools for a review session. Read the diff, then end with ho_review exactly once: approve, or request_changes with numbered findings (file:line). ho_ask_human pauses the task for a human decision.",
  triage:
    "Home Office tools for the boss. ho_delegate creates one task per independently verifiable piece of work, and its fields are the specification the worker and the reviewer get; ho_reply talks to the human; ho_hire adds a lasting colleague; ho_publish pushes a finished branch and opens its pull request. End with ho_report, status done.",
};

export class McpGateway {
  readonly #entries = new Map<string, Entry>();
  readonly #office: Office;
  readonly #log: Logger;
  readonly #skills: SkillLibrary;

  constructor(office: Office, skills: SkillLibrary, log: Logger) {
    this.#office = office;
    this.#skills = skills;
    this.#log = log;
  }

  static readonly path = "/mcp";

  register(ctx: McpSessionContext): string {
    const token = mintToken();
    this.#entries.set(token, { ctx, replied: false, report: null, skills: this.#skills });
    return token;
  }

  unregister(token: string): void {
    this.#entries.delete(token);
  }

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
    const { mode, provider } = entry.ctx;
    const server = new McpServer(
      { name: "home-office", version: VERSION },
      { instructions: INSTRUCTIONS[mode] },
    );
    const actor: Actor = { kind: "agent", agentId: entry.ctx.agentId };
    for (const tool of TOOLS) {
      if (
        !tool.modes.includes(mode) ||
        (tool.servesSkills === true && provider === "claude-code")
      ) {
        continue;
      }
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.shape },
        async (input: unknown): Promise<ToolResult> => {
          this.#log.debug(
            {
              sessionId: entry.ctx.sessionId,
              taskId: entry.ctx.taskId,
              tool: tool.name,
              fields: typeof input === "object" && input !== null ? Object.keys(input) : [],
            },
            "mcp tool called",
          );
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
