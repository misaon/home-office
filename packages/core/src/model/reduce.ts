import {
  addUsage,
  compact,
  isSessionActive,
  type ProjectId,
  type Session,
  type StoredEvent,
  type TaskId,
} from "@ho/protocol";
import {
  CHAT_TAIL,
  type Collection,
  dropFrom,
  indexInto,
  mailSourceKey,
  RATE_LIMIT_TAIL,
  RATE_LIMITED,
  type ReadModel,
} from "./read-model.ts";

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
  if (event.type === "task.removed") {
    removeTask(model, task.id, task.projectId);
    return;
  }
  const { assigneeId: _assignee, reviewerId: _reviewer, ...bare } = task;
  const touched = { ...task, updatedAt: event.at };
  switch (event.type) {
    case "task.edited": {
      const { title, brief, priority } = event.payload;
      model.tasks.set(task.id, { ...touched, ...compact({ title, brief, priority }) });
      break;
    }
    case "task.assigned": {
      model.tasks.set(task.id, {
        ...bare,
        ...compact({ reviewerId: task.reviewerId, assigneeId: event.payload.agentId ?? undefined }),
        updatedAt: event.at,
      });
      break;
    }
    case "task.reviewer_assigned": {
      model.tasks.set(task.id, {
        ...bare,
        ...compact({
          assigneeId: task.assigneeId,
          reviewerId: event.payload.reviewerId ?? undefined,
        }),
        updatedAt: event.at,
      });
      break;
    }
    case "task.status_changed": {
      model.tasks.set(task.id, { ...touched, status: event.payload.to });
      break;
    }
    case "task.artifacts_changed": {
      model.tasks.set(task.id, { ...touched, artifacts: event.payload.artifacts });
      break;
    }
    case "task.note_added": {
      model.tasks.set(task.id, { ...touched, notes: [...task.notes, event.payload.note] });
      break;
    }
    case "task.review_recorded": {
      model.tasks.set(task.id, { ...touched, reviewRounds: event.payload.rounds });
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
      const { state, runtimeSessionId, sandboxId, services } = event.payload;
      if (event.payload.reason?.startsWith(RATE_LIMITED) === true) {
        model.rateLimitsSeen += 1;
        model.rateLimits.push(event.at);
        if (model.rateLimits.length > RATE_LIMIT_TAIL) {
          model.rateLimits.splice(0, model.rateLimits.length - RATE_LIMIT_TAIL);
        }
      }
      const next = { ...session, state, ...compact({ runtimeSessionId, sandboxId, services }) };
      model.sessions.set(session.id, next);
      trackSessionState(model, next);
      break;
    }
    case "session.usage_recorded": {
      model.sessions.set(session.id, {
        ...session,
        usage: addUsage(session.usage, event.payload.usage),
      });
      break;
    }
    case "session.ended": {
      const ended = { ...session, state: event.payload.state, endedAt: event.payload.endedAt };
      model.sessions.set(session.id, ended);
      trackSessionState(model, ended);
      break;
    }
  }
}

function removeTask(model: ReadModel, taskId: TaskId, projectId: ProjectId): void {
  for (const sessionId of model.sessionsByTask.get(taskId) ?? []) {
    const session = model.sessions.get(sessionId);
    if (session !== undefined) {
      dropFrom(model.sessionsByAgent, session.agentId, sessionId);
    }
    model.sessions.delete(sessionId);
    model.activeSessions.delete(sessionId);
  }
  model.sessionsByTask.delete(taskId);
  model.tasks.delete(taskId);
  dropFrom(model.tasksByProject, projectId, taskId);
}

function removeProject(model: ReadModel, projectId: ProjectId): void {
  model.projects.delete(projectId);
  model.agentsByProject.delete(projectId);
  const owned = new Set(model.tasksByProject.get(projectId));
  for (const taskId of owned) {
    removeTask(model, taskId, projectId);
  }
  model.tasksByProject.delete(projectId);
  model.chat.delete(projectId);
  for (const mail of model.mail.values()) {
    if (mail.projectId === projectId) {
      model.mail.delete(mail.id);
      model.mailBySource.delete(mailSourceKey(mail.projectId, mail.connector, mail.externalId));
    }
  }
}

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
  "task.removed": "tasks",
  "handoff.requested": null,
  "chat.message_posted": "chat",
  "chat.cleared": "chat",
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
      removeProject(model, event.payload.projectId);
      for (const name of ["agents", "tasks", "sessions", "chat", "mail"] as const) {
        model.revisions[name] += 1;
      }
      break;
    }
    case "agent.created":
    case "agent.updated": {
      const { agent } = event.payload;
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
    case "task.removed":
    case "task.review_recorded": {
      applyTaskEvent(model, event);
      break;
    }
    case "handoff.requested": {
      break;
    }
    case "chat.cleared": {
      model.chat.set(event.payload.projectId, []);
      return;
    }
    case "chat.message_posted": {
      const { message } = event.payload;
      const floor = model.chat.get(message.projectId) ?? [];
      model.chat.set(message.projectId, [...floor, message].slice(-CHAT_TAIL));
      break;
    }
    case "mail.received": {
      const { mail } = event.payload;
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
