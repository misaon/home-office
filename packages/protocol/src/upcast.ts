import type { AgentRole } from "./roles.ts";

export type RawStoredEvent = {
  seq: number;
  id: string;
  type: string;
  at: string;
  actor: unknown;
  payload: unknown;
};

export type Upcast = { kind: "event"; event: RawStoredEvent } | { kind: "retired"; reason: string };

type Migration = {
  describe: string;
  apply: (event: RawStoredEvent) => RawStoredEvent;
};

const RETIRED_TYPES: Readonly<Record<string, string>> = {};

const RENAMED_ROLES: Readonly<Record<string, AgentRole>> = {
  worker: "developer",
  reviewer: "head",
  clerk: "secretary",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const renameAgentRole: Migration = {
  describe: "the roles worker, reviewer and clerk became developer, head and secretary",
  apply: (event) => {
    if (event.type !== "agent.created" && event.type !== "agent.updated") {
      return event;
    }
    const { payload } = event;
    if (!isRecord(payload) || !isRecord(payload["agent"])) {
      return event;
    }
    const agent: Record<string, unknown> = payload["agent"];
    const { role } = agent;
    if (typeof role !== "string") {
      return event;
    }
    const renamed = RENAMED_ROLES[role];
    return renamed === undefined
      ? event
      : { ...event, payload: { ...payload, agent: { ...agent, role: renamed } } };
  },
};

const OLD_DEFAULT_TURNS = 60;
const DEFAULT_TURNS = 200;

const raiseOldTurnDefault: Migration = {
  describe: "the default turn budget per task rose from 60 to 200 once the ledger spanned a task",
  apply: (event) => {
    if (event.type !== "agent.created" && event.type !== "agent.updated") {
      return event;
    }
    const { payload } = event;
    if (!isRecord(payload) || !isRecord(payload["agent"])) {
      return event;
    }
    const agent: Record<string, unknown> = payload["agent"];
    const { budgets } = agent;
    if (!isRecord(budgets) || budgets["maxTurnsPerTask"] !== OLD_DEFAULT_TURNS) {
      return event;
    }
    return {
      ...event,
      payload: {
        ...payload,
        agent: { ...agent, budgets: { ...budgets, maxTurnsPerTask: DEFAULT_TURNS } },
      },
    };
  },
};

const dropNamedEvidenceFiles: Migration = {
  describe:
    "evidence files became stored attachments; the bare file names recorded before that are dropped, the screenshots themselves stay on the chat message that carried them",
  apply: (event) => {
    if (event.type !== "mandate.evidence_recorded") {
      return event;
    }
    const { payload } = event;
    if (!isRecord(payload) || !isRecord(payload["evidence"])) {
      return event;
    }
    const evidence: Record<string, unknown> = payload["evidence"];
    const { files } = evidence;
    if (!Array.isArray(files) || files.every((file) => isRecord(file))) {
      return event;
    }
    return {
      ...event,
      payload: {
        ...payload,
        evidence: { ...evidence, files: files.filter((file) => isRecord(file)) },
      },
    };
  },
};

const MIGRATIONS: readonly Migration[] = [
  renameAgentRole,
  raiseOldTurnDefault,
  dropNamedEvidenceFiles,
];

export const upcastStoredEvent = (event: RawStoredEvent): Upcast => {
  const retired = RETIRED_TYPES[event.type];
  if (retired !== undefined) {
    return { kind: "retired", reason: retired };
  }
  return { kind: "event", event: MIGRATIONS.reduce((carried, m) => m.apply(carried), event) };
};
