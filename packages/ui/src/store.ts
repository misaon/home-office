import { type Collection, createReadModel, type ReadModel } from "@ho/core";
import {
  type Agent,
  type AgentId,
  type ChatMessage,
  isSessionActive,
  type LiveEvent,
  type MailItem,
  type MailItemId,
  type Project,
  type ProjectId,
  type Session,
  type SessionId,
  type Task,
  type TaskId,
} from "@ho/protocol";
import { create } from "zustand";

export type Connection = "connecting" | "online" | "offline" | "unauthorized" | "rejected";

/** What each connection state says to the viewer, as a dictionary key. */
export const CONNECTION_KEY = {
  connecting: "app.connecting",
  online: "app.connected",
  offline: "app.offline",
  unauthorized: "app.noToken",
  rejected: "app.rejected",
} as const satisfies Record<Connection, string>;

/** Immutable view of the read model for React: a collection keeps its identity until an event touches it. */
export type Snapshot = {
  projects: ReadonlyMap<ProjectId, Project>;
  agents: ReadonlyMap<AgentId, Agent>;
  tasks: ReadonlyMap<TaskId, Task>;
  sessions: ReadonlyMap<SessionId, Session>;
  chat: ReadonlyMap<ProjectId, readonly ChatMessage[]>;
  mail: ReadonlyMap<MailItemId, MailItem>;
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
});

/**
 * The session this colleague is in right now, if any. The office asks it from three places — the dot on
 * the floor, the team list and the boss's own line — and the snapshot carries no index to ask it with.
 */
export const activeSessionOf = (snapshot: Snapshot, agentId: AgentId): Session | undefined =>
  [...snapshot.sessions.values()].find((s) => s.agentId === agentId && isSessionActive(s.state));

/** Floors in the order they were built: the first project is floor 1. */
export const sortedFloors = (projects: ReadonlyMap<ProjectId, Project>): Project[] =>
  [...projects.values()].toSorted(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );

type UiState = {
  connection: Connection;
  /** True once the stored events were replayed; before that the office does not know whether floors exist. */
  replayed: boolean;
  /**
   * When the office first failed to reach the daemon, and still has not. The reconnect loop flips between
   * `offline` and `connecting` every couple of seconds, so a screen that reacts to `offline` alone would
   * flash; this is what "gone for a while" is measured from.
   */
  offlineSince: number | null;
  snapshot: Snapshot;
  live: ReadonlyMap<SessionId, readonly LiveEvent[]>;
  selectedAgentId: AgentId | null;
  /** The floor (project) shown in the office and the side panels; null until the first project exists. */
  floorId: ProjectId | null;
  addProjectOpen: boolean;
  /** The first-run checklist (Docker, images, token). */
  setupOpen: boolean;
  setConnection: (connection: Connection) => void;
  setReplayed: (replayed: boolean) => void;
  selectAgent: (agentId: AgentId | null) => void;
  selectFloor: (floorId: ProjectId | null) => void;
  setAddProjectOpen: (open: boolean) => void;
  setSetupOpen: (open: boolean) => void;
};

export const useUi = create<UiState>()((set) => ({
  connection: "connecting",
  replayed: false,
  offlineSince: null,
  snapshot: takeSnapshot(null),
  live: new Map(),
  selectedAgentId: null,
  floorId: null,
  addProjectOpen: false,
  setupOpen: false,
  setConnection: (connection) => {
    set((state) => ({
      connection,
      offlineSince:
        connection === "online"
          ? null
          : connection === "offline" && state.offlineSince === null
            ? Date.now()
            : state.offlineSince,
    }));
  },
  setReplayed: (replayed) => {
    set({ replayed });
  },
  selectAgent: (selectedAgentId) => {
    set({ selectedAgentId });
  },
  selectFloor: (floorId) => {
    set({ floorId, selectedAgentId: null });
  },
  setAddProjectOpen: (addProjectOpen) => {
    set({ addProjectOpen });
  },
  setSetupOpen: (setupOpen) => {
    set({ setupOpen });
  },
}));

/** Whether the daemon is reachable right now; queries and mutations are enabled by it. */
export const useOnline = (): boolean => useUi((s) => s.connection === "online");

const BUMP_MS = 200;

/**
 * Coalesces changes into one React update per frame. A frame callback never runs while the document is
 * hidden — and the page can be hidden between scheduling one and its firing — so both paths are armed
 * and whichever comes first wins.
 */
export const nextBump = (run: () => void): void => {
  let done = false;
  const once = (): void => {
    if (!done) {
      done = true;
      run();
    }
  };
  setTimeout(once, BUMP_MS);
  requestAnimationFrame(once);
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
