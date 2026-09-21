import { fileReport, patchTaskArtifacts, postAgentMessage } from "@ho/core";
import { HoReportInput } from "@ho/protocol";
import { type AnyTool, define } from "./mcp-tool.ts";
import { voiceFor } from "./voice.ts";

export const report: AnyTool = define({
  name: "ho_report",
  description:
    "End your work on the current task with a report. Call it exactly once: when your changes are committed (status review, with screenshots of anything a user can see in files), when the triage or the plan is finished (status done), or when you cannot continue (status blocked, and the summary says why). The office runs the floor's checks and publishes committed work itself.",
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
      const files = await entry.ctx.attachments.collect(entry.ctx.sessionId, input.files);
      await office.execute(actor, (m, c) =>
        patchTaskArtifacts(m, entry.ctx.taskId, { report: input.summary }, c),
      );
      if (files.length > 0) {
        const language = office.model.projects.get(entry.ctx.projectId)?.language ?? "en";
        await office.execute(actor, (m, c) =>
          postAgentMessage(
            m,
            entry.ctx.agentId,
            voiceFor(language).showResult,
            entry.ctx.taskId,
            c,
            files,
          ),
        );
      }
      entry.report = input;
      return `report received${files.length === 0 ? "" : ` with ${String(files.length)} file(s) for the human`}; the office runs the floor's checks, pushes your commits and hands the task on. Stop working now.`;
    }
    const task = await office.execute(actor, (m, c) => fileReport(m, entry.ctx.taskId, input, c));
    return `report filed; task is now ${task.status}. Stop working now.`;
  },
});
