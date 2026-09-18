import {
  askHuman,
  delegateTask,
  fileReport,
  handoffTask,
  membersOf,
  patchTaskArtifacts,
  planTask,
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
  HoPlanInput,
  HoPublishInput,
  HoRecallInput,
  HoReplyInput,
  HoReportInput,
  HoReviewInput,
  HoTaskStatusInput,
  isSessionActive,
} from "@ho/protocol";
import { z } from "zod";
import { recall } from "./recall.ts";
import { hire } from "./mcp-hire.ts";
import { ALL, define, type AnyTool, type ToolResult } from "./mcp-tool.ts";
import { publishTask } from "./publish.ts";

export type { AnyTool, Entry, McpSessionContext, ToolResult } from "./mcp-tool.ts";

const report = define({
  name: "ho_report",
  description:
    "End your work on the current task with a report. Call it exactly once: when your changes are committed (status review), when the triage or the plan is finished (status done), or when you cannot continue (status blocked, and the summary says why). The office runs the floor's checks and publishes committed work itself.",
  schema: HoReportInput,
  modes: ["work", "triage", "plan"],
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
  schema: HoAskHumanInput,
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
  schema: HoTaskStatusInput,
  modes: ["work", "triage", "plan"],
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

const recallPast = define({
  name: "ho_recall",
  description:
    "Search what this floor already finished: the reports and review findings of past tasks, ranked by how well they match your words. Use it before you start, when a file or subsystem is new to you, or when an error looks like one somebody met before. ho_task_status reads one task you already know the id of; this one finds the tasks you do not.",
  schema: HoRecallInput,
  modes: ALL,
  run: (input, office, entry) => {
    const hits = recall(
      office.model,
      entry.ctx.projectId,
      entry.ctx.taskId,
      input.query,
      input.limit,
      Date.now(),
    );
    if (hits.length === 0) {
      return Promise.resolve(
        `Nothing on this floor matches "${input.query}". Nobody has finished work here that mentions it, so treat this as new ground.`,
      );
    }
    return Promise.resolve(
      hits
        .map((hit) => {
          const lines = [
            `## ${hit.title} — ${hit.status}, ${hit.who}, ${hit.daysAgo === 0 ? "today" : `${String(hit.daysAgo)} day(s) ago`}`,
          ];
          if (hit.report !== "") {
            lines.push(`Report: ${hit.report}`);
          }
          for (const finding of hit.findings) {
            lines.push(`Review: ${finding}`);
          }
          return lines.join("\n");
        })
        .join("\n\n"),
    );
  },
});

const listAgents = define({
  name: "ho_list_agents",
  description:
    "The team on this floor: names, roles, skill packs and current load. Use it before ho_handoff or ho_delegate when the roster in your briefing is not enough.",
  schema: z.object({}),
  modes: ["work", "triage", "plan"],
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
  schema: HoHandoffInput,
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
  schema: HoReviewInput,
  modes: ["review"],
  run: async (input, office, entry, actor) => {
    const task = await office.execute(actor, (m, c) => submitReview(m, entry.ctx.taskId, input, c));
    return `verdict recorded; task is now ${task.status}. Stop now.`;
  },
});

const delegate = define({
  name: "ho_delegate",
  description:
    "Create a task on this floor and assign it to a colleague by name, or to yourself when you do the work. One task per independently verifiable piece of work; the fields are the specification the developer and the reviewers get, and qa/security decide who reviews it before the head of development.",
  schema: HoDelegateInput,
  modes: ["triage", "plan"],
  run: async (input, office, entry, actor) => {
    const task = await office.execute(actor, (m, c) => delegateTask(m, input, entry.ctx.taskId, c));
    return { taskId: task.id, status: task.status, assigneeId: task.assigneeId ?? null };
  },
});

const plan = define({
  name: "ho_plan",
  description:
    "Hand a request to the analyst to specify and split: they read the repository, write one task per verifiable piece of work with acceptance criteria and assign each to the colleague who fits. Use it for anything that is more than one small, obvious change; small errands and obvious single changes you delegate yourself with ho_delegate.",
  schema: HoPlanInput,
  modes: ["triage"],
  run: async (input, office, entry, actor) => {
    const task = await office.execute(actor, (m, c) => planTask(m, input, entry.ctx.taskId, c));
    return { taskId: task.id, status: task.status, assigneeId: task.assigneeId ?? null };
  },
});

const reply = define({
  name: "ho_reply",
  description:
    "Say something to the human in the office chat: a question back, a one-line plan, or an answer when there is nothing to delegate.",
  schema: HoReplyInput,
  modes: ["triage", "plan"],
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
  schema: HoPublishInput,
  modes: ["triage"],
  run: async (input, office, entry) => publishTask(office, entry.ctx.home, input.taskId),
});

const listSkills = define({
  name: "ho_list_skills",
  description:
    "The skills available to you: name and one-line description each. Read one with ho_get_skill before doing work it covers.",
  schema: z.object({}),
  modes: ALL,
  servesSkills: true,
  run: (_input, _office, entry) => entry.skills.index(entry.ctx.skillPacks),
});

const getSkill = define({
  name: "ho_get_skill",
  description:
    "The full instructions of one skill, and the names of the files it bundles. Call it when its description matches the work in front of you.",
  schema: HoGetSkillInput,
  modes: ALL,
  servesSkills: true,
  run: (input, _office, entry) => entry.skills.read(entry.ctx.skillPacks, input.name),
});

const getSkillFile = define({
  name: "ho_get_skill_file",
  description:
    "One file bundled with a skill, by the path ho_get_skill listed. Read it only when that skill's instructions send you to it.",
  schema: HoGetSkillFileInput,
  modes: ALL,
  servesSkills: true,
  run: (input, _office, entry) => entry.skills.file(entry.ctx.skillPacks, input.name, input.path),
});

export const TOOLS: readonly AnyTool[] = [
  report,
  askTheHuman,
  taskStatus,
  recallPast,
  listAgents,
  handoff,
  review,
  delegate,
  plan,
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
