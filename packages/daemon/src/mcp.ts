import {
  askHuman,
  delegateTask,
  fileReport,
  handoffTask,
  membersOf,
  patchTaskArtifacts,
  postAgentMessage,
  sessionsOfAgent,
  submitReview,
} from "@ho/core";
import {
  type Actor,
  type AgentId,
  errorMessage,
  HoAskHumanInput,
  HoDelegateInput,
  HoHandoffInput,
  HoReplyInput,
  HoReportInput,
  HoReviewInput,
  HoTaskStatusInput,
  isSessionActive,
  type ProjectId,
  type SessionId,
  type SessionMode,
  type TaskId,
} from "@ho/protocol";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { z } from "zod";
import type { Logger } from "./logger.ts";
import type { Office } from "./office.ts";
import { bearerToken, mintToken } from "./token.ts";
import { VERSION } from "./version.ts";

export type McpSessionContext = {
  sessionId: SessionId;
  taskId: TaskId;
  agentId: AgentId;
  projectId: ProjectId;
  mode: SessionMode;
};

type Entry = { ctx: McpSessionContext; replied: boolean; report: HoReportInput | null };
type ToolResult = { content: { type: "text"; text: string }[]; isError?: true };
type Tool<S extends z.ZodRawShape> = {
  name: string;
  description: string;
  shape: S;
  modes: readonly SessionMode[];
  run: (
    input: z.infer<z.ZodObject<S>>,
    office: Office,
    entry: Entry,
    actor: Actor,
  ) => Promise<unknown>;
};
/** A tool as the registration loop sees it: the shape for the SDK, and a handler that types its own input. */
type AnyTool = {
  name: string;
  description: string;
  shape: ZodRawShapeCompat;
  modes: readonly SessionMode[];
  handle: (input: unknown, office: Office, entry: Entry, actor: Actor) => Promise<unknown>;
};

const ALL: readonly SessionMode[] = ["work", "review", "triage"];

const define = <S extends z.ZodRawShape>(tool: Tool<S>): AnyTool => {
  const schema = z.object(tool.shape);
  return {
    ...tool,
    handle: (input, office, entry, actor) => tool.run(schema.parse(input), office, entry, actor),
  };
};

const report = define({
  name: "ho_report",
  description:
    "File your report for the current task and end your work on it. Call exactly once when you are finished or blocked.",
  shape: HoReportInput.shape,
  modes: ALL,
  run: async (input, office, entry, actor) => {
    if (entry.ctx.mode === "work") {
      if (entry.report !== null) {
        throw new Error("a report was already submitted");
      }
      await office.execute(actor, (m, c) =>
        patchTaskArtifacts(m, entry.ctx.taskId, { report: input.summary }, c),
      );
      entry.report = input;
      return "report received; the daemon will publish your commits before completing the task. Stop working now.";
    }
    const task = await office.execute(actor, (m, c) => fileReport(m, entry.ctx.taskId, input, c));
    return `report filed; task is now ${task.status}. Stop working now.`;
  },
});

const askTheHuman = define({
  name: "ho_ask_human",
  description:
    "Ask the human a blocking question. The task pauses until they answer in the office chat; you will be resumed with the answer. Commit first.",
  shape: HoAskHumanInput.shape,
  modes: ALL,
  run: async (input, office, entry, actor) => {
    await office.execute(actor, (m, c) => askHuman(m, entry.ctx.taskId, input.question, c));
    return "question sent; the task is paused. Stop now and wait to be resumed.";
  },
});

const taskStatus = define({
  name: "ho_task_status",
  description: "Current status, notes and artifacts of a task (defaults to yours).",
  shape: HoTaskStatusInput.shape,
  modes: ALL,
  run: (input, office, entry) => {
    const id = input.taskId ?? entry.ctx.taskId;
    const task = office.model.tasks.get(id);
    if (task === undefined || task.projectId !== entry.ctx.projectId) {
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
  },
});

const listAgents = define({
  name: "ho_list_agents",
  description: "The team on this floor: names, roles, skill packs and current load.",
  shape: {},
  modes: ALL,
  run: (_input, office, entry) =>
    Promise.resolve(
      membersOf(office.model, entry.ctx.projectId).map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        skills: a.skillPack,
        activeSessions: sessionsOfAgent(office.model, a.id).filter((s) => isSessionActive(s.state))
          .length,
      })),
    ),
});

const handoff = define({
  name: "ho_handoff",
  description:
    "Hand the current task to a colleague (by name). Commit first. Your session ends after this call.",
  shape: HoHandoffInput.shape,
  modes: ["work"],
  run: async (input, office, entry, actor) => {
    const task = await office.execute(actor, (m, c) =>
      handoffTask(m, entry.ctx.taskId, entry.ctx.agentId, input, c),
    );
    return `handed off to ${task.assigneeId ?? "?"}; stop now.`;
  },
});

const review = define({
  name: "ho_review",
  description:
    "File your review verdict for the branch under review. approve closes the task; request_changes sends it back to the author with your findings.",
  shape: HoReviewInput.shape,
  modes: ["review"],
  run: async (input, office, entry, actor) => {
    const task = await office.execute(actor, (m, c) => submitReview(m, entry.ctx.taskId, input, c));
    return `verdict recorded; task is now ${task.status}. Stop now.`;
  },
});

const delegate = define({
  name: "ho_delegate",
  description:
    "Create a task on this floor and (optionally) assign it to a colleague by name — or to yourself when you do the work. One task per independent piece of work, with acceptance criteria in the brief.",
  shape: HoDelegateInput.shape,
  modes: ["triage"],
  run: async (input, office, entry, actor) => {
    const task = await office.execute(actor, (m, c) => delegateTask(m, input, entry.ctx.taskId, c));
    return { taskId: task.id, status: task.status, assigneeId: task.assigneeId ?? null };
  },
});

const reply = define({
  name: "ho_reply",
  description:
    "Say something to the human in the office chat (questions back, a short plan, or an answer when there is nothing to delegate).",
  shape: HoReplyInput.shape,
  modes: ["triage"],
  run: async (input, office, entry, actor) => {
    await office.execute(actor, (m, c) =>
      postAgentMessage(m, entry.ctx.agentId, input.text, entry.ctx.taskId, c),
    );
    entry.replied = true;
    return "posted";
  },
});

const TOOLS: readonly AnyTool[] = [
  report,
  askTheHuman,
  taskStatus,
  listAgents,
  handoff,
  review,
  delegate,
  reply,
];

const text = (value: unknown): ToolResult => ({
  content: [
    { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
  ],
});

/**
 * The daemon's MCP tool server for agents. Each sandbox session gets a bearer token; every request builds a
 * small `McpServer` bound to that session, so tools can never act on another task, and the server is
 * dropped with the request — the SDK allows one transport per server, and agents call tools in parallel.
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
        async (input): Promise<ToolResult> => {
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
