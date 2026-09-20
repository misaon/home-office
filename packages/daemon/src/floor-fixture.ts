import {
  applyEvent,
  type CommandContext,
  createIdFactory,
  createReadModel,
  type ReadModel,
} from "@ho/core";
import {
  Agent,
  errorMessage,
  HUMAN_ACTOR,
  type NewEvent,
  Project,
  ProjectId,
  StoredEvent,
  SYSTEM_ACTOR,
  Task,
  type TaskId,
} from "@ho/protocol";

export const NOW = "2026-09-20T12:00:00.000Z";
export const PROJECT = ProjectId.parse("01a0bbbb-0000-7000-8000-000000000002");
export const COMMIT = "0123456789abcdef0123456789abcdef01234567";

export const ids = createIdFactory(
  { now: () => new Date(NOW) },
  {
    randomize: (bytes) => {
      crypto.getRandomValues(bytes);
    },
  },
);

export const human = (): CommandContext => ({ ids, now: NOW, actor: HUMAN_ACTOR });
export const system = (): CommandContext => ({ ids, now: NOW, actor: SYSTEM_ACTOR });

const person = (id: string, name: string, role: string, budgets: object = {}): Agent =>
  Agent.parse({
    id: `01a0aaaa-0000-7000-8000-0000000000${id}`,
    name,
    role,
    appearance: { gender: "neutral" },
    provider: "claude-code",
    model: "sonnet",
    effort: "high",
    budgets,
    projectId: PROJECT,
    createdAt: NOW,
    updatedAt: NOW,
  });

export const REX = person("11", "Rex", "backend", { maxTurnsPerTask: 10 });
export const IDA = person("12", "Ida", "frontend");
export const MARA = person("13", "Mara", "head");
export const OTTO = person("14", "Otto", "qa");

let seq = 0;

export const record = (model: ReadModel, type: string, payload: unknown): void => {
  seq += 1;
  applyEvent(
    model,
    StoredEvent.parse({ id: ids.event(), at: NOW, actor: HUMAN_ACTOR, type, payload, seq }),
  );
};

export const apply = (model: ReadModel, events: readonly NewEvent[]): void => {
  for (const event of events) {
    record(model, event.type, event.payload);
  }
};

export const floorWith = (...staff: readonly Agent[]): ReadModel => {
  const model = createReadModel();
  record(model, "project.created", {
    project: Project.parse({
      id: PROJECT,
      name: "floor",
      repo: { kind: "local", path: "/tmp/floor" },
      createdAt: NOW,
      updatedAt: NOW,
    }),
  });
  for (const agent of staff) {
    record(model, "agent.created", { agent });
  }
  return model;
};

export const workTask = (
  model: ReadModel,
  fields: Partial<{
    id: string;
    status: string;
    kind: string;
    assigneeId: string;
    reviews: object;
    dependsOn: string[];
    artifacts: object;
    priority: string;
    title: string;
  }>,
): TaskId => {
  const task = Task.parse({
    id: fields.id ?? ids.task(),
    projectId: PROJECT,
    kind: fields.kind ?? "work",
    title: fields.title ?? "a change",
    brief: "",
    status: fields.status ?? "in_progress",
    assigneeId: fields.assigneeId ?? REX.id,
    reviews: fields.reviews ?? { qa: true, security: false, head: true },
    dependsOn: fields.dependsOn ?? [],
    source: { kind: "manual" },
    artifacts: fields.artifacts ?? {},
    priority: fields.priority ?? "normal",
    createdAt: NOW,
    updatedAt: NOW,
  });
  record(model, "task.created", { task });
  return task.id;
};

export const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) {
    throw new Error(errorMessage(result.error));
  }
  return result.value;
};
