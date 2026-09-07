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

/** Floors in the order they were built: the first project is floor 1. */
export const sortedFloors = (snapshot: Pick<Snapshot, "projects">): Project[] =>
  [...snapshot.projects.values()].toSorted(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );

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
  /** True once the stored events were replayed; before that the office does not know whether floors exist. */
  replayed: boolean;
  snapshot: Snapshot;
  live: ReadonlyMap<SessionId, readonly LiveEvent[]>;
  lastError: string | null;
  panel: Panel;
  selectedAgentId: AgentId | null;
  /** The floor (project) shown in the office and the side panels; null until the first project exists. */
  floorId: ProjectId | null;
  addProjectOpen: boolean;
  spriteSets: string[];
  /** The first-run checklist (Docker, images, token, smoke test). */
  setupOpen: boolean;
  setConnection: (connection: Connection) => void;
  setReplayed: (replayed: boolean) => void;
  setError: (message: string | null) => void;
  selectPanel: (panel: Panel) => void;
  selectAgent: (agentId: AgentId | null) => void;
  selectFloor: (floorId: ProjectId | null) => void;
  setAddProjectOpen: (open: boolean) => void;
  setSpriteSets: (sets: string[]) => void;
  setSetupOpen: (open: boolean) => void;
};

export const useUi = create<UiState>()((set) => ({
  connection: "connecting",
  replayed: false,
  snapshot: takeSnapshot(),
  live: new Map(),
  lastError: null,
  panel: "chat",
  selectedAgentId: null,
  floorId: null,
  addProjectOpen: false,
  spriteSets: [],
  setupOpen: false,
  setConnection: (connection) => {
    set({ connection });
  },
  setReplayed: (replayed) => {
    set({ replayed });
  },
  setError: (lastError) => {
    set({ lastError });
  },
  selectPanel: (panel) => {
    set({ panel });
  },
  selectAgent: (selectedAgentId) => {
    set(selectedAgentId === null ? { selectedAgentId } : { selectedAgentId, panel: "inspector" });
  },
  selectFloor: (floorId) => {
    set({ floorId, selectedAgentId: null });
  },
  setAddProjectOpen: (addProjectOpen) => {
    set({ addProjectOpen });
  },
  setSpriteSets: (spriteSets) => {
    set({ spriteSets });
  },
  setSetupOpen: (setupOpen) => {
    set({ setupOpen });
  },
}));

let modelBumpScheduled = false;
/**
 * Coalesces model changes into one React update per frame (the replay can be thousands of events) and keeps the
 * selected floor valid: the first floor when none is selected or the selected one was removed.
 */
export function scheduleModelBump(): void {
  if (!modelBumpScheduled) {
    modelBumpScheduled = true;
    requestAnimationFrame(() => {
      modelBumpScheduled = false;
      const snapshot = takeSnapshot();
      const { floorId } = useUi.getState();
      const valid = floorId !== null && snapshot.projects.has(floorId);
      useUi.setState(
        valid ? { snapshot } : { snapshot, floorId: sortedFloors(snapshot)[0]?.id ?? null },
      );
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
