import { compact, type ProjectId, type StoredEvent, type TaskId } from "@ho/protocol";
import { applyMandateEvent, removeMandatesOf } from "./reduce-mandate.ts";
import {
  CHAT_TAIL,
  type Collection,
  dropFrom,
  indexInto,
  mailSourceKey,
  type ReadModel,
} from "./read-model.ts";
import { applySessionEvent } from "./reduce-session.ts";

type TaskEvent = Extract<StoredEvent, { type: `task.${string}` }>;

function applyTaskEvent(model: ReadModel, event: TaskEvent): void {
  if (event.type === "task.created") {
    const created = event.payload.task;
    model.tasks.set(created.id, created);
    indexInto(model.tasksByProject, created.projectId, created.id);
    if (created.mandateId !== undefined) {
      indexInto(model.tasksByMandate, created.mandateId, created.id);
    }
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
    case "task.review_waived": {
      model.tasks.set(task.id, {
        ...touched,
        reviews: { ...task.reviews, [event.payload.stage]: false },
      });
      break;
    }
    case "task.rated": {
      model.tasks.set(task.id, { ...touched, rating: event.payload.rating });
      break;
    }
  }
}

function removeTask(model: ReadModel, taskId: TaskId, projectId: ProjectId): void {
  const mandateId = model.tasks.get(taskId)?.mandateId;
  if (mandateId !== undefined) {
    dropFrom(model.tasksByMandate, mandateId, taskId);
  }
  const sessions = model.sessionsByTask.get(taskId);
  if (sessions !== undefined && sessions.size > 0) {
    model.revisions.sessions += 1;
  }
  for (const sessionId of sessions ?? []) {
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
  removeMandatesOf(model, projectId);
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
  "task.review_waived": "tasks",
  "task.rated": "tasks",
  "task.removed": "tasks",
  "mandate.opened": "mandates",
  "mandate.acceptance_stated": "mandates",
  "mandate.evidence_recorded": "mandates",
  "mandate.artifacts_changed": "mandates",
  "mandate.baseline_recorded": "mandates",
  "mandate.status_changed": "mandates",
  "mandate.round_opened": "mandates",
  "handoff.requested": null,
  "chat.message_posted": "chat",
  "chat.cleared": "chat",
  "mail.received": "mail",
  "mail.acknowledged": "mail",
  "session.started": "sessions",
  "session.state_changed": "sessions",
  "session.usage_recorded": "sessions",
  "session.ended": "sessions",
  "session.plan_recorded": "sessions",
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
      for (const name of ["agents", "tasks", "sessions", "chat", "mail", "mandates"] as const) {
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
        model.formerAgents.set(gone.id, gone);
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
    case "task.rated":
    case "task.review_recorded":
    case "task.review_waived": {
      applyTaskEvent(model, event);
      break;
    }
    case "mandate.opened":
    case "mandate.acceptance_stated":
    case "mandate.evidence_recorded":
    case "mandate.artifacts_changed":
    case "mandate.baseline_recorded":
    case "mandate.status_changed":
    case "mandate.round_opened": {
      applyMandateEvent(model, event);
      break;
    }
    case "handoff.requested": {
      break;
    }
    case "chat.cleared": {
      const { projectId, threadId } = event.payload;
      const floor = model.chat.get(projectId) ?? [];
      model.chat.set(
        projectId,
        floor.filter((message) => message.threadId !== threadId),
      );
      break;
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
    case "session.ended":
    case "session.plan_recorded": {
      applySessionEvent(model, event);
      break;
    }
  }
  model.lastSeq = event.seq;
}
