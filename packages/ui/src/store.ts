import { type Collection, createReadModel, type ReadModel } from "@ho/core";
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
type Connection = "connecting" | "online" | "offline" | "unauthorized" | "rejected";

/** Immutable view of the read model for React: a collection keeps its identity until an event touches it. */
export type Snapshot = {
  projects: ReadonlyMap<ProjectId, Project>;
  agents: ReadonlyMap<AgentId, Agent>;
  tasks: ReadonlyMap<TaskId, Task>;
  sessions: ReadonlyMap<SessionId, Session>;
  chat: ReadonlyMap<ProjectId, readonly ChatMessage[]>;
  mail: ReadonlyMap<MailItemId, MailItem>;
  /** The projection's own index, shared by reference: only `applyEvent` ever writes it. */
  agentsByProject: ReadonlyMap<ProjectId, ReadonlySet<AgentId>>;
};

/** The event-sourced read model, mutated in place by `applyEvent`; the simulation bridge reads it directly. */
export const model: ReadModel = createReadModel();

const copied: Record<Collection, number> = {
  projects: -1,
  agents: -1,
  tasks: -1,
  sessions: -1,
  chat: -1,
  mail: -1,
};

const changed = (name: Collection): boolean => {
  const moved = copied[name] !== model.revisions[name];
  copied[name] = model.revisions[name];
  return moved;
};

const takeSnapshot = (previous: Snapshot | null): Snapshot => ({
  projects: changed("projects") || previous === null ? new Map(model.projects) : previous.projects,
  agents: changed("agents") || previous === null ? new Map(model.agents) : previous.agents,
  tasks: changed("tasks") || previous === null ? new Map(model.tasks) : previous.tasks,
  sessions: changed("sessions") || previous === null ? new Map(model.sessions) : previous.sessions,
  chat: changed("chat") || previous === null ? new Map(model.chat) : previous.chat,
  mail: changed("mail") || previous === null ? new Map(model.mail) : previous.mail,
  agentsByProject: model.agentsByProject,
});

/** Floors in the order they were built: the first project is floor 1. */
export const sortedFloors = (projects: ReadonlyMap<ProjectId, Project>): Project[] =>
  [...projects.values()].toSorted(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );

/** Recent live runtime events per session (the daemon does not persist them either). */
const liveLog = new Map<SessionId, LiveEvent[]>();
const dirtyLive = new Set<SessionId>();
const LIVE_LIMIT = 300;
const LIVE_SESSION_LIMIT = 20;

export function pushLive(event: LiveEvent): void {
  const list = liveLog.get(event.sessionId) ?? [];
  list.push(event);
  if (list.length > LIVE_LIMIT) {
    list.splice(0, list.length - LIVE_LIMIT);
  }
  liveLog.delete(event.sessionId);
  liveLog.set(event.sessionId, list);
  if (liveLog.size > LIVE_SESSION_LIMIT) {
    const oldest = liveLog.keys().next();
    if (oldest.done !== true) {
      liveLog.delete(oldest.value);
      dirtyLive.add(oldest.value);
    }
  }
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
  snapshot: takeSnapshot(null),
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

const HIDDEN_BUMP_MS = 200;

const nextBump = (run: () => void): void => {
  if (document.hidden) {
    setTimeout(run, HIDDEN_BUMP_MS);
    return;
  }
  requestAnimationFrame(run);
};

let modelBumpScheduled = false;
/**
 * Coalesces model changes into one React update per frame (the replay can be thousands of events) and keeps the
 * selected floor valid: the first floor when none is selected or the selected one was removed.
 */
export function scheduleModelBump(): void {
  if (!modelBumpScheduled) {
    modelBumpScheduled = true;
    nextBump(() => {
      modelBumpScheduled = false;
      const state = useUi.getState();
      const snapshot = takeSnapshot(state.snapshot);
      const { floorId } = state;
      const valid = floorId !== null && snapshot.projects.has(floorId);
      useUi.setState(
        valid
          ? { snapshot }
          : { snapshot, floorId: sortedFloors(snapshot.projects)[0]?.id ?? null },
      );
    });
  }
}

let liveBumpScheduled = false;
export function scheduleLiveBump(): void {
  if (!liveBumpScheduled) {
    liveBumpScheduled = true;
    nextBump(() => {
      liveBumpScheduled = false;
      useUi.setState((s) => {
        const live = new Map(s.live);
        for (const id of dirtyLive) {
          const events = liveLog.get(id);
          if (events === undefined) {
            live.delete(id);
          } else {
            live.set(id, [...events]);
          }
        }
        dirtyLive.clear();
        return { live };
      });
    });
  }
}
