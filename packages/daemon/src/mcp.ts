import {
  type Actor,
  type Attachment,
  clip,
  errorMessage,
  type HoReportInput,
  type SessionMode,
} from "@ho/protocol";
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import type { Logger } from "./logger.ts";
import { type Entry, type McpSessionContext, text, TOOLS, type ToolResult } from "./mcp-tools.ts";
import type { Office } from "./office.ts";
import type { SkillLibrary } from "./skills.ts";
import { elapsedMs } from "./timing.ts";
import { bearerToken, mintToken } from "./token.ts";
import type { TraceStore } from "./traces.ts";
import { VERSION } from "./version.ts";

const INPUT_LOG_CHARS = 500;

const INSTRUCTIONS: Readonly<Record<SessionMode, string>> = {
  work: "Home Office tools for a work session. Commit on the task branch, then end with ho_report: status review when the work is ready, its files carrying a screenshot of anything a user can see, blocked with the reason when you cannot continue. ho_ask_human pauses the task for a human decision, ho_handoff passes it to a named colleague, ho_task_status returns the notes and artifacts when you lack context. The office pushes and opens pull requests itself.",
  review:
    "Home Office tools for a review session. Read the diff, then end with ho_review exactly once: approve, or request_changes with numbered findings (file:line). ho_ask_human pauses the task for a human decision.",
  triage:
    "Home Office tools for the boss. ho_plan hands a request to the analyst, who specifies and splits it; ho_delegate creates one task per independently verifiable piece of work, and its fields are the specification the developer and the reviewers get; ho_reply talks to the human; ho_hire adds a lasting colleague; ho_publish pushes a finished branch and opens its pull request. End with ho_report, status done.",
  plan: "Home Office tools for the analyst. Read the repository, then ho_delegate one task per independently verifiable piece of work, assigned to the colleague whose role fits; its fields are the specification the developer and the reviewers get. ho_reply tells the human the plan; ho_ask_human pauses for a decision only the human can make. End with ho_report, status done, and the conditions of done for the whole request in acceptance.",
  verify:
    "Home Office tools for the verifier of a whole request. Exercise the integrated result against every condition in your briefing — running the application only the way the briefing says, otherwise judging statically — then end with ho_verify exactly once: pass or fail, one judgement per condition, screenshots in files. ho_ask_human pauses for a human decision.",
};

const shorten = (input: unknown): string =>
  clip(input === undefined ? "" : JSON.stringify(input), INPUT_LOG_CHARS);

export class McpGateway {
  readonly #entries = new Map<string, Entry>();
  readonly #office: Office;
  readonly #log: Logger;
  readonly #skills: SkillLibrary;
  readonly #traces: TraceStore;

  constructor(office: Office, skills: SkillLibrary, log: Logger, traces: TraceStore) {
    this.#office = office;
    this.#skills = skills;
    this.#log = log;
    this.#traces = traces;
  }

  static readonly path = "/mcp";

  register(ctx: McpSessionContext): string {
    const token = mintToken();
    this.#entries.set(token, {
      ctx,
      replied: false,
      delegated: false,
      applicationReady: false,
      report: null,
      reportFiles: [],
      skills: this.#skills,
    });
    return token;
  }

  unregister(token: string): void {
    this.#entries.delete(token);
  }

  replied(token: string): boolean {
    return this.#entries.get(token)?.replied ?? false;
  }

  delegated(token: string): boolean {
    return this.#entries.get(token)?.delegated ?? false;
  }

  report(token: string): HoReportInput | null {
    return this.#entries.get(token)?.report ?? null;
  }

  skillVersions(packs: readonly string[]): Promise<Record<string, string>> {
    return this.#skills.versions(packs);
  }

  reportFiles(token: string): readonly Attachment[] {
    return this.#entries.get(token)?.reportFiles ?? [];
  }

  markApplication(token: string, ready: boolean): void {
    const entry = this.#entries.get(token);
    if (entry !== undefined) {
      entry.applicationReady = ready;
    }
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
    const { mode, provider, sessionId, taskId } = entry.ctx;
    const server = new McpServer(
      { name: "home-office", version: VERSION },
      { instructions: INSTRUCTIONS[mode] },
    );
    const actor: Actor = { kind: "agent", agentId: entry.ctx.agentId };
    const office = this.#office.traced({
      correlationId: entry.ctx.mandateId,
      causationId: sessionId,
    });
    for (const tool of TOOLS) {
      if (
        !tool.modes.includes(mode) ||
        (tool.servesSkills === true && provider === "claude-code")
      ) {
        continue;
      }
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.schema },
        async (input: unknown): Promise<ToolResult> => {
          const started = Bun.nanoseconds();
          this.#log.debug(
            { sessionId, taskId, tool: tool.name, input: shorten(input) },
            "mcp tool called",
          );
          try {
            const answer = text(await tool.handle(input, office, entry, actor));
            const ms = elapsedMs(started);
            this.#traces.mcp(sessionId, { tool: tool.name, ok: true, ms });
            this.#log.debug(
              {
                sessionId,
                tool: tool.name,
                ms,
                chars: answer.content.reduce((total, block) => total + block.text.length, 0),
              },
              "mcp tool answered",
            );
            return answer;
          } catch (error) {
            const message = errorMessage(error);
            const ms = elapsedMs(started);
            this.#traces.mcp(sessionId, { tool: tool.name, ok: false, ms, error: message });
            this.#log.warn(
              { sessionId, taskId, tool: tool.name, ms, err: message },
              "mcp tool rejected",
            );
            return { content: [{ type: "text", text: message }], isError: true };
          }
        },
      );
    }
    return server;
  }
}
