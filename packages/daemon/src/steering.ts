import type { StoredEvent } from "@ho/protocol";
import type { Logger } from "./logger.ts";
import { followEvents, type Office } from "./office.ts";
import { steerMessage } from "./prompts.ts";
import type { SessionManager } from "./sessions.ts";

export function startSteering(
  office: Office,
  sessions: SessionManager,
  log: Logger,
): { stop: () => Promise<void> } {
  const onNote = (event: Extract<StoredEvent, { type: "task.note_added" }>): void => {
    const { taskId, note } = event.payload;
    if (note.kind !== "steer") {
      return;
    }
    const author =
      note.author.kind === "agent" ? office.model.agents.get(note.author.agentId) : undefined;
    const sessionId = sessions.steer(taskId, steerMessage(author?.name ?? "the boss", note.text));
    if (sessionId === null) {
      log.info({ taskId }, "no session runs for the task; the instruction waits for the next one");
      return;
    }
    log.info(
      { taskId, sessionId, chars: note.text.length },
      "instruction passed into the running session",
    );
  };
  const following = followEvents(
    office,
    ["task.note_added"],
    (event) => {
      if (event.type === "task.note_added") {
        onNote(event);
      }
    },
    log,
    "steering",
  );
  return { stop: () => following.stop() };
}
