import { bossOf, postAgentMessage } from "@ho/core";
import { type Agent, errorMessage, type StoredEvent, SYSTEM_ACTOR, type Task } from "@ho/protocol";
import { createdLine, nextStageLine, statusLine, voiceOf } from "./boss-lines.ts";
import type { Logger } from "./logger.ts";
import { mandateStatusLine, roundLine } from "./mandate-voice.ts";
import { followEvents, type Office } from "./office.ts";

export function startBossVoice(office: Office, log: Logger): { stop: () => Promise<void> } {
  const say = async (boss: Agent, text: string, taskId: Task["id"]): Promise<void> => {
    await office
      .execute(SYSTEM_ACTOR, (m, ctx) =>
        postAgentMessage(m, boss.id, text, taskId, ctx, { kind: "status" }),
      )
      .catch((error: unknown) => {
        log.warn({ err: errorMessage(error) }, "boss status message failed");
      });
  };
  const onCreated = async (task: Task): Promise<void> => {
    const boss = bossOf(office.model, task.projectId);
    const project = office.model.projects.get(task.projectId);
    if (boss === undefined || project === undefined) {
      return;
    }
    const text = createdLine(
      office.model,
      voiceOf(office.model, task.projectId),
      boss,
      project,
      task,
    );
    if (text !== null) {
      await say(boss, text, task.id);
    }
  };
  const onStatus = async (
    event: Extract<StoredEvent, { type: "task.status_changed" }>,
  ): Promise<void> => {
    const { taskId, to, reason } = event.payload;
    const task = office.model.tasks.get(taskId);
    const boss = task === undefined ? undefined : bossOf(office.model, task.projectId);
    if (task === undefined || boss === undefined) {
      return;
    }
    const voice = voiceOf(office.model, task.projectId);
    const text = statusLine(office.model, voice, boss, task, to, reason, event.at);
    if (text !== null) {
      await say(boss, text, task.id);
    }
  };
  const onReviewer = async (
    event: Extract<StoredEvent, { type: "task.reviewer_assigned" }>,
  ): Promise<void> => {
    const task = office.model.tasks.get(event.payload.taskId);
    const boss = task === undefined ? undefined : bossOf(office.model, task.projectId);
    if (task === undefined || boss === undefined) {
      return;
    }
    const voice = voiceOf(office.model, task.projectId);
    const text = nextStageLine(office.model, voice, task, event.payload.reviewerId);
    if (text !== null) {
      await say(boss, text, event.payload.taskId);
    }
  };
  const onMandate = async (
    event: Extract<StoredEvent, { type: "mandate.status_changed" | "mandate.round_opened" }>,
  ): Promise<void> => {
    const mandate = office.model.mandates.get(event.payload.mandateId);
    const boss = mandate === undefined ? undefined : bossOf(office.model, mandate.projectId);
    const project =
      mandate === undefined ? undefined : office.model.projects.get(mandate.projectId);
    if (mandate === undefined || boss === undefined || project === undefined) {
      return;
    }
    const voice = voiceOf(office.model, mandate.projectId);
    const text =
      event.type === "mandate.round_opened"
        ? roundLine(voice, mandate, event.payload.round, event.payload.reason)
        : mandateStatusLine(
            office.model,
            voice,
            mandate,
            project,
            event.payload.to,
            event.payload.reason,
            event.at,
          );
    if (text !== null) {
      await say(boss, text, mandate.rootTaskId);
    }
  };
  const following = followEvents(
    office,
    [
      "task.created",
      "task.status_changed",
      "task.reviewer_assigned",
      "mandate.status_changed",
      "mandate.round_opened",
    ],
    (event) => {
      if (event.type === "task.created") {
        return onCreated(event.payload.task);
      }
      if (event.type === "task.status_changed") {
        return onStatus(event);
      }
      if (event.type === "task.reviewer_assigned") {
        return onReviewer(event);
      }
      if (event.type === "mandate.status_changed" || event.type === "mandate.round_opened") {
        return onMandate(event);
      }
      return undefined;
    },
    log,
    "boss voice",
  );
  return {
    stop: async () => {
      await following.stop();
    },
  };
}
