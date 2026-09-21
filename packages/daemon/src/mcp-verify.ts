import { evidenceOf, fileReport, postAgentMessage, recordEvidence, tasksOfMandate } from "@ho/core";
import {
  type CriterionJudgement,
  type Evidence,
  HoVerifyInput,
  type Mandate,
  type Task,
} from "@ho/protocol";
import { type AnyTool, define } from "./mcp-tool.ts";

const numbers = (judgements: readonly { index: number }[]): string =>
  judgements.map((judgement) => String(judgement.index)).join(", ");

const checkCoverage = (
  label: string,
  count: number,
  judgements: readonly CriterionJudgement[],
): void => {
  const seen = new Set<number>();
  for (const judgement of judgements) {
    if (judgement.index > count) {
      throw new Error(
        `${label} has ${String(count)} entries; there is no number ${String(judgement.index)}`,
      );
    }
    if (seen.has(judgement.index)) {
      throw new Error(`${label} ${String(judgement.index)} is judged twice`);
    }
    seen.add(judgement.index);
  }
  const missing = Array.from({ length: count }, (_, index) => index + 1).filter(
    (index) => !seen.has(index),
  );
  if (missing.length > 0) {
    throw new Error(`judge every ${label}: ${missing.map(String).join(", ")} missing`);
  }
};

const taskUnderVerification = (tasks: readonly Task[], judgement: { taskId: Task["id"] }): Task => {
  const task = tasks.find((candidate) => candidate.id === judgement.taskId);
  if (task === undefined) {
    throw new Error(`task ${judgement.taskId} is not part of this request`);
  }
  return task;
};

export const verify: AnyTool = define({
  name: "ho_verify",
  description:
    "End the verification of the whole request with your judgement: pass or fail, one entry per condition by its number, the unverified task criteria your briefing lists with their task id, and screenshots in files. The office keeps every entry as evidence on the integrated commit. Call it exactly once, then stop.",
  schema: HoVerifyInput,
  modes: ["verify"],
  run: async (input, office, entry, actor) => {
    const task = office.model.tasks.get(entry.ctx.taskId);
    const mandate: Mandate | undefined =
      task?.mandateId === undefined ? undefined : office.model.mandates.get(task.mandateId);
    const commit = mandate?.artifacts.commit;
    if (task === undefined || mandate === undefined || commit === undefined) {
      throw new Error("this session verifies no integrated request");
    }
    checkCoverage("condition", Math.max(1, mandate.acceptance.length), input.criteria);
    const tasks = tasksOfMandate(office.model, mandate);
    const failing = [...input.criteria, ...input.taskCriteria].filter(
      (judgement) => judgement.verdict === "fail",
    );
    if (input.verdict === "pass" && failing.length > 0) {
      throw new Error(`condition ${numbers(failing)} fails; the verdict cannot be pass`);
    }
    const files = await entry.ctx.attachments.collect(entry.ctx.sessionId, input.files);
    const names = files.map((file) => file.name);
    await office.execute(actor, (m, c) => {
      const entries: Evidence[] = [
        ...input.criteria.map((judgement) =>
          evidenceOf(c, {
            sessionId: entry.ctx.sessionId,
            commit,
            criterion: judgement.index - 1,
            method: "verification",
            verdict: judgement.verdict,
            proof: judgement.evidence,
            files: names,
          }),
        ),
        ...input.taskCriteria.map((judgement) => {
          const judged = taskUnderVerification(tasks, judgement);
          return evidenceOf(c, {
            sessionId: entry.ctx.sessionId,
            taskId: judged.id,
            commit: judged.artifacts.commit ?? commit,
            criterion: judgement.index - 1,
            method: "verification",
            verdict: judgement.verdict,
            proof: judgement.evidence,
            files: names,
          });
        }),
      ];
      return recordEvidence(m, mandate.id, entries, c);
    });
    await office.execute(actor, (m, c) =>
      postAgentMessage(m, entry.ctx.agentId, input.summary, entry.ctx.taskId, c, files),
    );
    const filed = await office.execute(actor, (m, c) =>
      fileReport(m, entry.ctx.taskId, { status: "done", summary: input.summary }, c),
    );
    return `verdict ${input.verdict} recorded on commit ${commit}; task is now ${filed.status}. Stop now.`;
  },
});
