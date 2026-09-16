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
  HoGetSkillFileInput,
  HoGetSkillInput,
  HoHandoffInput,
  HoPublishInput,
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
import { publishTask } from "./publish.ts";
import type { SkillLibrary } from "./skills.ts";

export type McpSessionContext = {
  sessionId: SessionId;
  skillPack: string;
  taskId: TaskId;
  agentId: AgentId;
  projectId: ProjectId;
  mode: SessionMode;
  attachments: AttachmentStore;
  home: string;
};

export type Entry = {
  ctx: McpSessionContext;
  replied: boolean;
  report: HoReportInput | null;
  skills: SkillLibrary;
};
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

const publish = define({
  name: "ho_publish",
  description:
    "Push a finished task's branch to the remote and open a pull request for it, returning the link. The task must already have a branch — work that has not been done yet cannot be published.",
  shape: HoPublishInput.shape,
  modes: ["triage"],
  run: async (input, office, entry) => publishTask(office, entry.ctx.home, input.taskId),
});

const listSkills = define({
  name: "ho_list_skills",
  description:
    "The skills available to you: name and one-line description each. Read one with ho_get_skill before doing work it covers.",
  shape: {},
  modes: ALL,
  run: (_input, _office, entry) => entry.skills.index(entry.ctx.skillPack),
});

const getSkill = define({
  name: "ho_get_skill",
  description:
    "The full instructions of one skill, and the names of the files it bundles. Call it when its description matches the work in front of you.",
  shape: HoGetSkillInput.shape,
  modes: ALL,
  run: (input, _office, entry) => entry.skills.read(entry.ctx.skillPack, input.name),
});

const getSkillFile = define({
  name: "ho_get_skill_file",
  description:
    "One file bundled with a skill, by the path ho_get_skill listed. Read it only when that skill's instructions send you to it.",
  shape: HoGetSkillFileInput.shape,
  modes: ALL,
  run: (input, _office, entry) => entry.skills.file(entry.ctx.skillPack, input.name, input.path),
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
  publish,
  listSkills,
  getSkill,
  getSkillFile,
];

export const text = (value: unknown): ToolResult => ({
  content: [
    { type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
  ],
});
