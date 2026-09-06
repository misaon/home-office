import type { StoredEvent, Task } from "@ho/protocol";
import type { ReadModel } from "./read-model.ts";

const touch = (model: ReadModel, task: Task, at: string): void => {
  model.tasks.set(task.id, { ...task, updatedAt: at });
};

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
    case "task.created": {
      model.tasks.set(event.payload.task.id, event.payload.task);
      break;
    }
    case "task.edited": {
      const task = model.tasks.get(event.payload.taskId);
      if (task !== undefined) {
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
      }
      break;
    }
    case "task.assigned": {
      const task = model.tasks.get(event.payload.taskId);
      if (task !== undefined) {
        const { assigneeId: _dropped, ...rest } = task;
        touch(
          model,
          event.payload.agentId === null ? rest : { ...rest, assigneeId: event.payload.agentId },
          event.at,
        );
      }
      break;
    }
    case "task.status_changed": {
      const task = model.tasks.get(event.payload.taskId);
      if (task !== undefined) {
        touch(model, { ...task, status: event.payload.to }, event.at);
      }
      break;
    }
    case "task.artifacts_changed": {
      const task = model.tasks.get(event.payload.taskId);
      if (task !== undefined) {
        touch(model, { ...task, artifacts: event.payload.artifacts }, event.at);
      }
      break;
    }
    case "chat.message_posted": {
      model.chat.push(event.payload.message);
      break;
    }
  }
  model.lastSeq = event.seq;
}
