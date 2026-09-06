import type { StoredEvent, Task } from "@ho/protocol";
import type { ReadModel } from "./read-model.ts";

const touch = (model: ReadModel, task: Task, at: string): void => {
  model.tasks.set(task.id, { ...task, updatedAt: at });
};

type TaskEvent = Extract<StoredEvent, { type: `task.${string}` }>;
type SessionEvent = Extract<StoredEvent, { type: `session.${string}` }>;

function applyTaskEvent(model: ReadModel, event: TaskEvent): void {
  if (event.type === "task.created") {
    model.tasks.set(event.payload.task.id, event.payload.task);
    return;
  }
  const task = model.tasks.get(event.payload.taskId);
  if (task === undefined) {
    return;
  }
  switch (event.type) {
    case "task.edited": {
      const { title, brief, priority } = event.payload;
      touch(
        model,
        {
          ...task,
          ...(title === undefined ? {} : { title }),
          ...(brief === undefined ? {} : { brief }),
          ...(priority === undefined ? {} : { priority }),
        },
        event.at,
      );
      break;
    }
    case "task.assigned": {
      const { assigneeId: _dropped, ...rest } = task;
      touch(
        model,
        event.payload.agentId === null ? rest : { ...rest, assigneeId: event.payload.agentId },
        event.at,
      );
      break;
    }
    case "task.reviewer_assigned": {
      const { reviewerId: _dropped, ...rest } = task;
      touch(
        model,
        event.payload.reviewerId === null
          ? rest
          : { ...rest, reviewerId: event.payload.reviewerId },
        event.at,
      );
      break;
    }
    case "task.status_changed": {
      touch(model, { ...task, status: event.payload.to }, event.at);
      break;
    }
    case "task.artifacts_changed": {
      touch(model, { ...task, artifacts: event.payload.artifacts }, event.at);
      break;
    }
    case "task.note_added": {
      touch(model, { ...task, notes: [...task.notes, event.payload.note] }, event.at);
      break;
    }
    case "task.review_recorded": {
      touch(model, { ...task, reviewRounds: event.payload.rounds }, event.at);
      break;
    }
  }
}

function applySessionEvent(model: ReadModel, event: SessionEvent): void {
  if (event.type === "session.started") {
    model.sessions.set(event.payload.session.id, event.payload.session);
    return;
  }
  const session = model.sessions.get(event.payload.sessionId);
  if (session === undefined) {
    return;
  }
  switch (event.type) {
    case "session.state_changed": {
      const { runtimeSessionId, sandboxId } = event.payload;
      model.sessions.set(session.id, {
        ...session,
        state: event.payload.state,
        ...(runtimeSessionId === undefined ? {} : { runtimeSessionId }),
        ...(sandboxId === undefined ? {} : { sandboxId }),
      });
      break;
    }
    case "session.usage_recorded": {
      const u = event.payload.usage;
      model.sessions.set(session.id, {
        ...session,
        usage: {
          inputTokens: session.usage.inputTokens + u.inputTokens,
          outputTokens: session.usage.outputTokens + u.outputTokens,
          cacheReadTokens: session.usage.cacheReadTokens + u.cacheReadTokens,
          cacheWriteTokens: session.usage.cacheWriteTokens + u.cacheWriteTokens,
          turns: session.usage.turns + u.turns,
        },
      });
      break;
    }
    case "session.ended": {
      model.sessions.set(session.id, {
        ...session,
        state: event.payload.state,
        endedAt: event.payload.endedAt,
      });
      break;
    }
  }
}

/** Folds one stored event into the model. Unknown ids are ignored so a partial log never throws. */
export function applyEvent(model: ReadModel, event: StoredEvent): void {
  switch (event.type) {
    case "project.created":
    case "project.updated": {
      model.projects.set(event.payload.project.id, event.payload.project);
      break;
    }
    case "project.removed": {
      model.projects.delete(event.payload.projectId);
      break;
    }
    case "agent.created":
    case "agent.updated": {
      model.agents.set(event.payload.agent.id, event.payload.agent);
      break;
    }
    case "agent.removed": {
      model.agents.delete(event.payload.agentId);
      break;
    }
    case "task.created":
    case "task.edited":
    case "task.assigned":
    case "task.reviewer_assigned":
    case "task.status_changed":
    case "task.artifacts_changed":
    case "task.note_added":
    case "task.review_recorded": {
      applyTaskEvent(model, event);
      break;
    }
    case "handoff.requested": {
      break;
    }
    case "chat.message_posted": {
      model.chat.push(event.payload.message);
      break;
    }
    case "session.started":
    case "session.state_changed":
    case "session.usage_recorded":
    case "session.ended": {
      applySessionEvent(model, event);
      break;
    }
  }
  model.lastSeq = event.seq;
}
