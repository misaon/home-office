import { createReadModel, type ReadModel } from "@ho/core";
import type {
  Agent,
  AgentId,
  ChatMessage,
  LiveEvent,
  MailItem,
  MailItemId,
  Project,
  ProjectId,
  Session,
  SessionId,
  Task,
  TaskId,
} from "@ho/protocol";
import { create } from "zustand";

export type Panel = "chat" | "board" | "inspector" | "usage" | "resources" | "settings";
type Connection = "connecting" | "online" | "offline" | "unauthorized";

/** Immutable view of the read model for React: fresh Map instances on every change. */
export type Snapshot = {
  projects: ReadonlyMap<ProjectId, Project>;
  agents: ReadonlyMap<AgentId, Agent>;
  tasks: ReadonlyMap<TaskId, Task>;
  sessions: ReadonlyMap<SessionId, Session>;
  chat: readonly ChatMessage[];
  mail: ReadonlyMap<MailItemId, MailItem>;
};

/** The event-sourced read model, mutated in place by `applyEvent`; the simulation bridge reads it directly. */
export const model: ReadModel = createReadModel();

const takeSnapshot = (): Snapshot => ({
  projects: new Map(model.projects),
  agents: new Map(model.agents),
  tasks: new Map(model.tasks),
  sessions: new Map(model.sessions),
  chat: [...model.chat],
  mail: new Map(model.mail),
});

/** Recent live runtime events per session (the daemon does not persist them either). */
const liveLog = new Map<SessionId, LiveEvent[]>();
const dirtyLive = new Set<SessionId>();
const LIVE_LIMIT = 300;

export function pushLive(event: LiveEvent): void {
  const list = liveLog.get(event.sessionId) ?? [];
  list.push(event);
  if (list.length > LIVE_LIMIT) {
    list.splice(0, list.length - LIVE_LIMIT);
  }
  liveLog.set(event.sessionId, list);
  dirtyLive.add(event.sessionId);
}

type UiState = {
  connection: Connection;
  snapshot: Snapshot;
  live: ReadonlyMap<SessionId, readonly LiveEvent[]>;
  headcounts: Readonly<Record<string, number>>;
  lastError: string | null;
  floorId: string;
  panel: Panel;
  selectedAgentId: AgentId | null;
  chatProjectId: ProjectId | null;
  spriteSets: string[];
  /** The first-run checklist (Docker, images, token, team, smoke test). */
  setupOpen: boolean;
  setConnection: (connection: Connection) => void;
  setHeadcounts: (headcounts: Record<string, number>) => void;
  setError: (message: string | null) => void;
  selectFloor: (floorId: string) => void;
  selectPanel: (panel: Panel) => void;
  selectAgent: (agentId: AgentId | null) => void;
  setChatProject: (projectId: ProjectId | null) => void;
  setSpriteSets: (sets: string[]) => void;
  setSetupOpen: (open: boolean) => void;
};

export const useUi = create<UiState>()((set) => ({
  connection: "connecting",
  snapshot: takeSnapshot(),
  live: new Map(),
  headcounts: {},
  lastError: null,
  floorId: "lobby",
  panel: "chat",
  selectedAgentId: null,
  chatProjectId: null,
  spriteSets: [],
  setupOpen: false,
  setConnection: (connection) => {
    set({ connection });
  },
  setHeadcounts: (headcounts) => {
    set({ headcounts });
  },
  setError: (lastError) => {
    set({ lastError });
  },
  selectFloor: (floorId) => {
    set({ floorId });
  },
  selectPanel: (panel) => {
    set({ panel });
  },
  selectAgent: (selectedAgentId) => {
    set(selectedAgentId === null ? { selectedAgentId } : { selectedAgentId, panel: "inspector" });
  },
  setChatProject: (chatProjectId) => {
    set({ chatProjectId });
  },
  setSpriteSets: (spriteSets) => {
    set({ spriteSets });
  },
  setSetupOpen: (setupOpen) => {
    set({ setupOpen });
  },
}));

let modelBumpScheduled = false;
/** Coalesces model changes into one React update per frame (the replay can be thousands of events). */
export function scheduleModelBump(): void {
  if (!modelBumpScheduled) {
    modelBumpScheduled = true;
    requestAnimationFrame(() => {
      modelBumpScheduled = false;
      useUi.setState({ snapshot: takeSnapshot() });
    });
  }
}

let liveBumpScheduled = false;
export function scheduleLiveBump(): void {
  if (!liveBumpScheduled) {
    liveBumpScheduled = true;
    requestAnimationFrame(() => {
      liveBumpScheduled = false;
      useUi.setState((s) => {
        const live = new Map(s.live);
        for (const id of dirtyLive) {
          live.set(id, [...(liveLog.get(id) ?? [])]);
        }
        dirtyLive.clear();
        return { live };
      });
    });
  }
}
