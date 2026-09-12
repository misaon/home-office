import { compact, type Session, type StoredEvent, type Task } from "@ho/protocol";
import { isSessionActive, RATE_LIMITED } from "../commands/sessions.ts";
import {
  CHAT_TAIL,
  type Collection,
  dropFrom,
  indexInto,
  mailSourceKey,
  RATE_LIMIT_TAIL,
  type ReadModel,
} from "./read-model.ts";

const touch = (model: ReadModel, task: Task, at: string): void => {
  model.tasks.set(task.id, { ...task, updatedAt: at });
};

type TaskEvent = Extract<StoredEvent, { type: `task.${string}` }>;
type SessionEvent = Extract<StoredEvent, { type: `session.${string}` }>;

function applyTaskEvent(model: ReadModel, event: TaskEvent): void {
  if (event.type === "task.created") {
    const created = event.payload.task;
    model.tasks.set(created.id, created);
    indexInto(model.tasksByProject, created.projectId, created.id);
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
          ...compact({ title, brief, priority }),
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

const trackSessionState = (model: ReadModel, session: Session): void => {
  if (isSessionActive(session.state)) {
    model.activeSessions.add(session.id);
    return;
  }
  model.activeSessions.delete(session.id);
};

function applySessionEvent(model: ReadModel, event: SessionEvent): void {
  if (event.type === "session.started") {
    const started = event.payload.session;
    model.sessions.set(started.id, started);
    indexInto(model.sessionsByTask, started.taskId, started.id);
    indexInto(model.sessionsByAgent, started.agentId, started.id);
    trackSessionState(model, started);
    return;
  }
  const session = model.sessions.get(event.payload.sessionId);
  if (session === undefined) {
    return;
  }
  switch (event.type) {
    case "session.state_changed": {
      const { runtimeSessionId, sandboxId, services } = event.payload;
      if (event.payload.reason?.startsWith(RATE_LIMITED) === true) {
        model.rateLimitsSeen += 1;
        model.rateLimits.push(event.at);
        if (model.rateLimits.length > RATE_LIMIT_TAIL) {
          model.rateLimits.splice(0, model.rateLimits.length - RATE_LIMIT_TAIL);
        }
      }
      const next = {
        ...session,
        state: event.payload.state,
        ...compact({ runtimeSessionId }),
        ...compact({ sandboxId }),
        ...compact({ services }),
      };
      model.sessions.set(session.id, next);
      trackSessionState(model, next);
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
      const ended = {
        ...session,
        state: event.payload.state,
        endedAt: event.payload.endedAt,
      };
      model.sessions.set(session.id, ended);
      trackSessionState(model, ended);
      break;
    }
  }
}

/** Folds one stored event into the model. Unknown ids are ignored so a partial log never throws. */
const TOUCHES: Readonly<Record<StoredEvent["type"], Collection | null>> = {
  "project.created": "projects",
  "project.updated": "projects",
  "project.removed": "projects",
  "agent.created": "agents",
  "agent.updated": "agents",
  "agent.removed": "agents",
  "task.created": "tasks",
  "task.edited": "tasks",
  "task.assigned": "tasks",
  "task.reviewer_assigned": "tasks",
  "task.status_changed": "tasks",
  "task.artifacts_changed": "tasks",
  "task.note_added": "tasks",
  "task.review_recorded": "tasks",
  "handoff.requested": null,
  "chat.message_posted": "chat",
  "mail.received": "mail",
  "mail.acknowledged": "mail",
  "session.started": "sessions",
  "session.state_changed": "sessions",
  "session.usage_recorded": "sessions",
  "session.ended": "sessions",
};

export function applyEvent(model: ReadModel, event: StoredEvent): void {
  if (event.seq <= model.lastSeq) {
    return;
  }
  const touched = TOUCHES[event.type];
  if (touched !== null) {
    model.revisions[touched] += 1;
  }
  switch (event.type) {
    case "project.created":
    case "project.updated": {
      model.projects.set(event.payload.project.id, event.payload.project);
      break;
    }
    case "project.removed": {
      model.projects.delete(event.payload.projectId);
      model.agentsByProject.delete(event.payload.projectId);
      break;
    }
    case "agent.created":
    case "agent.updated": {
      const agent = event.payload.agent;
      model.agents.set(agent.id, agent);
      indexInto(model.agentsByProject, agent.projectId, agent.id);
      break;
    }
    case "agent.removed": {
      const gone = model.agents.get(event.payload.agentId);
      model.agents.delete(event.payload.agentId);
      if (gone !== undefined) {
        dropFrom(model.agentsByProject, gone.projectId, gone.id);
      }
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
      const message = event.payload.message;
      const floor = model.chat.get(message.projectId) ?? [];
      model.chat.set(message.projectId, [...floor, message].slice(-CHAT_TAIL));
      break;
    }
    case "mail.received": {
      const mail = event.payload.mail;
      model.mail.set(mail.id, mail);
      model.mailBySource.set(
        mailSourceKey(mail.projectId, mail.connector, mail.externalId),
        mail.id,
      );
      break;
    }
    case "mail.acknowledged": {
      const mail = model.mail.get(event.payload.mailId);
      if (mail !== undefined) {
        model.mail.set(mail.id, { ...mail, acks: [...mail.acks, event.payload.ack] });
      }
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
