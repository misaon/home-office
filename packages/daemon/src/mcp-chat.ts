import { postAgentMessage, steerTask } from "@ho/core";
import { HoReplyInput, HoSteerInput } from "@ho/protocol";
import { type AnyTool, define } from "./mcp-tool.ts";

export const reply: AnyTool = define({
  name: "ho_reply",
  description:
    "Say something to the human in the office chat: a question back, a one-line plan, or an answer when there is nothing to delegate.",
  schema: HoReplyInput,
  modes: ["triage", "plan"],
  run: async (input, office, entry, actor) => {
    const files = await entry.ctx.attachments.collect(entry.ctx.sessionId, input.files);
    await office.execute(actor, (m, c) =>
      postAgentMessage(m, entry.ctx.agentId, input.text, entry.ctx.taskId, c, {
        attachments: files,
      }),
    );
    entry.replied = true;
    return `posted${files.length === 0 ? "" : ` with ${String(files.length)} file(s)`}`;
  },
});

export const steer: AnyTool = define({
  name: "ho_steer",
  description:
    "Pass an instruction from the human into a colleague's task in flight, by the task id your briefing lists. They receive it inside their running session at their next step, or at the start of their next session when nobody is running; the task, its criteria and its reviewers stay as they are. Confirm to the human with ho_reply what you passed on and to whom.",
  schema: HoSteerInput,
  modes: ["triage"],
  run: async (input, office, _entry, actor) => {
    const task = await office.execute(actor, (m, c) =>
      steerTask(m, input.taskId, input.instruction, c),
    );
    const worker =
      task.assigneeId === undefined ? undefined : office.model.agents.get(task.assigneeId);
    return `instruction recorded for "${task.title}"; the office delivers it to ${worker?.name ?? "whoever takes the task"}. Tell the human with ho_reply what you passed on.`;
  },
});
