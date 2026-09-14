// The office's own tools, as the MCP gateway registers them: one table, one handler each.
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
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { z } from "zod";
import type { AttachmentStore } from "./attachments.ts";
import type { Office } from "./office.ts";

export type McpSessionContext = {
  sessionId: SessionId;
  taskId: TaskId;
  agentId: AgentId;
  projectId: ProjectId;
  mode: SessionMode;
  attachments: AttachmentStore;
};

export type Entry = { ctx: McpSessionContext; replied: boolean; report: HoReportInput | null };
export type ToolResult = { content: { type: "text"; text: string }[]; isError?: true };
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
export type AnyTool = {
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
    const files = await entry.ctx.attachments.collect(entry.ctx.sessionId, input.files);
    await office.execute(actor, (m, c) =>
      postAgentMessage(m, entry.ctx.agentId, input.text, entry.ctx.taskId, c, files),
    );
    entry.replied = true;
    return `posted${files.length === 0 ? "" : ` with ${String(files.length)} file(s)`}`;
  },
});

export const TOOLS: readonly AnyTool[] = [
  report,
  askTheHuman,
  taskStatus,
  listAgents,
  handoff,
  review,
  delegate,
  reply,
];

export const text = (value: unknown): ToolResult => ({
  content: [
    { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
  ],
});

/**
 * The daemon's MCP tool server for agents. Each sandbox session gets a bearer token; every request builds a
 * small `McpServer` bound to that session, so tools can never act on another task, and the server is
 * dropped with the request — the SDK allows one transport per server, and agents call tools in parallel.
 */
