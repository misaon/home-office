import {
  askHuman,
  delegateTask,
  fileReport,
  handoffTask,
  isSessionActive,
  membersOf,
  postAgentMessage,
  setTaskArtifacts,
  submitReview,
} from "@ho/core";
import {
  type AgentId,
  errorMessage,
  HoAskHumanInput,
  HoDelegateInput,
  HoHandoffInput,
  HoReplyInput,
  HoReportInput,
  HoReviewInput,
  HoTaskStatusInput,
  type ProjectId,
  type SessionId,
  type SessionMode,
  type TaskId,
} from "@ho/protocol";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Logger } from "./logger.ts";
import type { Office } from "./office.ts";

export type McpSessionContext = {
  sessionId: SessionId;
  taskId: TaskId;
  agentId: AgentId;
  projectId: ProjectId;
  mode: SessionMode;
};

type Entry = { ctx: McpSessionContext; replied: boolean; report: HoReportInput | null };
type ToolResult = { content: { type: "text"; text: string }[]; isError?: true };
type Run = <T>(fn: () => Promise<T>) => Promise<ToolResult>;

const text = (value: unknown): ToolResult => ({
  content: [
    { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
  ],
});

function registerCommon(server: McpServer, office: Office, entry: Entry, run: Run): void {
  const { ctx } = entry;
  const actor = { kind: "agent", agentId: ctx.agentId } as const;
  server.registerTool(
    "ho_report",
    {
      description:
        "File your report for the current task and end your work on it. Call exactly once when you are finished or blocked.",
      inputSchema: HoReportInput.shape,
    },
    (input) =>
      run(async () => {
        const report = HoReportInput.parse(input);
        if (ctx.mode === "work") {
          if (entry.report !== null) {
            throw new Error("a report was already submitted");
          }
          await office.execute(actor, (m, c) =>
            setTaskArtifacts(
              m,
              {
                id: ctx.taskId,
                artifacts: { ...m.tasks.get(ctx.taskId)?.artifacts, report: report.summary },
              },
              c,
            ),
          );
          entry.report = report;
          return "report received; the daemon will publish your commits before completing the task. Stop working now.";
        }
        const task = await office.execute(actor, (m, c) => fileReport(m, ctx.taskId, report, c));
        return `report filed; task is now ${task.status}. Stop working now.`;
      }),
  );
  server.registerTool(
    "ho_ask_human",
    {
      description:
        "Ask the human a blocking question. The task pauses until they answer in the office chat; you will be resumed with the answer. Commit first.",
      inputSchema: HoAskHumanInput.shape,
    },
    (input) =>
      run(async () => {
        await office.execute(actor, (m, c) =>
          askHuman(m, ctx.taskId, HoAskHumanInput.parse(input).question, c),
        );
        return "question sent; the task is paused. Stop now and wait to be resumed.";
      }),
  );
  server.registerTool(
    "ho_task_status",
    {
      description: "Current status, notes and artifacts of a task (defaults to yours).",
      inputSchema: HoTaskStatusInput.shape,
    },
    (input) =>
      run(() => {
        const id = HoTaskStatusInput.parse(input).taskId ?? ctx.taskId;
        const task = office.model.tasks.get(id);
        if (task === undefined || task.projectId !== ctx.projectId) {
          throw new Error(`task ${id} not found`);
        }
        return Promise.resolve({
          id: task.id,
          title: task.title,
          status: task.status,
          assigneeId: task.assigneeId ?? null,
          artifacts: task.artifacts,
          notes: task.notes.slice(-10),
        });
      }),
  );
  server.registerTool(
    "ho_list_agents",
    { description: "The team on this floor: names, roles, skill packs and current load." },
    () =>
      run(() => {
        const active = [...office.model.sessions.values()].filter((s) => isSessionActive(s.state));
        return Promise.resolve(
          membersOf(office.model, ctx.projectId).map((a) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            skills: a.skillPack,
            activeSessions: active.filter((s) => s.agentId === a.id).length,
          })),
        );
      }),
  );
}

function registerWork(server: McpServer, office: Office, entry: Entry, run: Run): void {
  const { ctx } = entry;
  const actor = { kind: "agent", agentId: ctx.agentId } as const;
  server.registerTool(
    "ho_handoff",
    {
      description:
        "Hand the current task to a colleague (by name). Commit first. Your session ends after this call.",
      inputSchema: HoHandoffInput.shape,
    },
    (input) =>
      run(async () => {
        const task = await office.execute(actor, (m, c) =>
          handoffTask(m, ctx.taskId, ctx.agentId, HoHandoffInput.parse(input), c),
        );
        return `handed off to ${task.assigneeId ?? "?"}; stop now.`;
      }),
  );
}

function registerReview(server: McpServer, office: Office, entry: Entry, run: Run): void {
  const { ctx } = entry;
  const actor = { kind: "agent", agentId: ctx.agentId } as const;
  server.registerTool(
    "ho_review",
    {
      description:
        "File your review verdict for the branch under review. approve closes the task; request_changes sends it back to the author with your findings.",
      inputSchema: HoReviewInput.shape,
    },
    (input) =>
      run(async () => {
        const task = await office.execute(actor, (m, c) =>
          submitReview(m, ctx.taskId, HoReviewInput.parse(input), c),
        );
        return `verdict recorded; task is now ${task.status}. Stop now.`;
      }),
  );
}

function registerTriage(server: McpServer, office: Office, entry: Entry, run: Run): void {
  const { ctx } = entry;
  const actor = { kind: "agent", agentId: ctx.agentId } as const;
  server.registerTool(
    "ho_delegate",
    {
      description:
        "Create a task on this floor and (optionally) assign it to a colleague by name — or to yourself when you do the work. One task per independent piece of work, with acceptance criteria in the brief.",
      inputSchema: HoDelegateInput.shape,
    },
    (input) =>
      run(async () => {
        const task = await office.execute(actor, (m, c) =>
          delegateTask(m, HoDelegateInput.parse(input), ctx.taskId, c),
        );
        return { taskId: task.id, status: task.status, assigneeId: task.assigneeId ?? null };
      }),
  );
  server.registerTool(
    "ho_reply",
    {
      description:
        "Say something to the human in the office chat (questions back, a short plan, or an answer when there is nothing to delegate).",
      inputSchema: HoReplyInput.shape,
    },
    (input) =>
      run(async () => {
        await office.execute(actor, (m, c) =>
          postAgentMessage(m, ctx.agentId, HoReplyInput.parse(input).text, ctx.taskId, c),
        );
        entry.replied = true;
        return "posted";
      }),
  );
}

/**
 * The daemon's MCP tool server for agents. Each sandbox session gets a bearer token; every request builds a
 * small `McpServer` bound to that session, so tools can never act on another task. Stateless JSON transport.
 */
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
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
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
    const header = req.headers.get("authorization");
    const token = header?.startsWith("Bearer ") === true ? header.slice("Bearer ".length) : null;
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
      await transport.close().catch(() => null);
    }
  }

  #build(entry: Entry): McpServer {
    const server = new McpServer({ name: "home-office", version: "0.1.0" });
    const run: Run = async (fn) => {
      try {
        return text(await fn());
      } catch (error) {
        const message = errorMessage(error);
        this.#log.warn({ sessionId: entry.ctx.sessionId, err: message }, "mcp tool rejected");
        return { content: [{ type: "text", text: message }], isError: true };
      }
    };
    registerCommon(server, this.#office, entry, run);
    if (entry.ctx.mode === "work") {
      registerWork(server, this.#office, entry, run);
    }
    if (entry.ctx.mode === "review") {
      registerReview(server, this.#office, entry, run);
    }
    if (entry.ctx.mode === "triage") {
      registerTriage(server, this.#office, entry, run);
    }
    return server;
  }
}
