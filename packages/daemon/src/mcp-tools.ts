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
} from "@ho/protocol";
import { hire } from "./mcp-hire.ts";
import { ALL, define, type AnyTool, type ToolResult } from "./mcp-tool.ts";
import { publishTask } from "./publish.ts";

export type { AnyTool, Entry, McpSessionContext, ToolResult } from "./mcp-tool.ts";

const report = define({
  name: "ho_report",
  description:
    "End your work on the current task with a report. Call it exactly once: when your changes are committed (status review), or when you cannot continue (status blocked, and the summary says why). The office runs the floor's checks and publishes committed work itself.",
  shape: HoReportInput.shape,
  modes: ["work", "triage"],
  run: async (input, office, entry, actor) => {
    if (entry.ctx.mode === "work") {
      if (entry.report !== null) {
        throw new Error("a report was already submitted");
      }
      if (input.status === "done") {
        throw new Error(
          "a work session ends with status review or blocked; the office decides when a task is done",
        );
      }
      await office.execute(actor, (m, c) =>
        patchTaskArtifacts(m, entry.ctx.taskId, { report: input.summary }, c),
      );
      entry.report = input;
      return "report received; the office runs the floor's checks, pushes your commits and hands the task on. Stop working now.";
    }
    const task = await office.execute(actor, (m, c) => fileReport(m, entry.ctx.taskId, input, c));
    return `report filed; task is now ${task.status}. Stop working now.`;
  },
});

const askTheHuman = define({
  name: "ho_ask_human",
  description:
    "Ask the human one blocking question. The task pauses until they answer in the office chat, and you are resumed with the answer.",
  shape: HoAskHumanInput.shape,
  modes: ALL,
  run: async (input, office, entry, actor) => {
    await office.execute(actor, (m, c) => askHuman(m, entry.ctx.taskId, input.question, c));
    return "question sent; the task is paused. Stop now and wait to be resumed.";
  },
});

const taskStatus = define({
  name: "ho_task_status",
  description:
    "Call this when you lack context: a task's status, its artifacts (branch, report, pull request) and its last ten notes, including the office's check output and review findings. Defaults to your own task.",
  shape: HoTaskStatusInput.shape,
  modes: ["work", "triage"],
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
  description:
    "The team on this floor: names, roles, skill packs and current load. Use it before ho_handoff or ho_delegate when the roster in your briefing is not enough.",
  shape: {},
  modes: ["work", "triage"],
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
    "Hand the current task to a colleague (by name) with a brief of what is done and what is next. Commit first; your session ends after this call.",
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
    "File your verdict on the branch under review. approve closes the task; request_changes sends it back to the author with your numbered findings.",
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
    "Create a task on this floor and assign it to a colleague by name, or to yourself when you do the work. One task per independently verifiable piece of work; the fields are the specification the worker and the reviewer get.",
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
    "Say something to the human in the office chat: a question back, a one-line plan, or an answer when there is nothing to delegate.",
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
    "Push a finished task's branch to the remote and open its pull request now, returning the link. Only for tasks that already have a branch; on pull-request floors the office does this by itself when a task finishes.",
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
  servesSkills: true,
  run: (_input, _office, entry) => entry.skills.index(entry.ctx.skillPack),
});

const getSkill = define({
  name: "ho_get_skill",
  description:
    "The full instructions of one skill, and the names of the files it bundles. Call it when its description matches the work in front of you.",
  shape: HoGetSkillInput.shape,
  modes: ALL,
  servesSkills: true,
  run: (input, _office, entry) => entry.skills.read(entry.ctx.skillPack, input.name),
});

const getSkillFile = define({
  name: "ho_get_skill_file",
  description:
    "One file bundled with a skill, by the path ho_get_skill listed. Read it only when that skill's instructions send you to it.",
  shape: HoGetSkillFileInput.shape,
  modes: ALL,
  servesSkills: true,
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
  hire,
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
