import { type Collection, createReadModel, type ReadModel } from "@ho/core";
import {
  type Agent,
  type AgentId,
  type ChatMessage,
  type LiveEvent,
  type MailItem,
  type MailItemId,
  type Mandate,
  type MandateId,
  type Project,
  type ProjectId,
  type Session,
  type SessionId,
  type Task,
  type TaskId,
} from "@ho/protocol";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Connection = "connecting" | "online" | "offline" | "unauthorized" | "rejected";

export const CONNECTION_KEY = {
  connecting: "app.connecting",
  online: "app.connected",
  offline: "app.offline",
  unauthorized: "app.noToken",
  rejected: "app.rejected",
} as const satisfies Record<Connection, string>;

export type Snapshot = {
  projects: ReadonlyMap<ProjectId, Project>;
  agents: ReadonlyMap<AgentId, Agent>;
  tasks: ReadonlyMap<TaskId, Task>;
  sessions: ReadonlyMap<SessionId, Session>;
  chat: ReadonlyMap<ProjectId, readonly ChatMessage[]>;
  mail: ReadonlyMap<MailItemId, MailItem>;
  mandates: ReadonlyMap<MandateId, Mandate>;
  activeByAgent: ReadonlyMap<AgentId, Session>;
};

export const model: ReadModel = createReadModel();

const copied: Record<Collection, number> = {
  projects: -1,
  agents: -1,
  tasks: -1,
  sessions: -1,
  chat: -1,
  mail: -1,
  mandates: -1,
};

const changed = (name: Collection): boolean => {
  const moved = copied[name] !== model.revisions[name];
  copied[name] = model.revisions[name];
  return moved;
};

const activeByAgent = (): Map<AgentId, Session> => {
  const index = new Map<AgentId, Session>();
  for (const id of model.activeSessions) {
    const session = model.sessions.get(id);
    if (session !== undefined) {
      index.set(session.agentId, session);
    }
  }
  return index;
};

const takeSnapshot = (previous: Snapshot | null): Snapshot => {
  const sessionsMoved = changed("sessions") || previous === null;
  return {
    projects:
      changed("projects") || previous === null ? new Map(model.projects) : previous.projects,
    agents: changed("agents") || previous === null ? new Map(model.agents) : previous.agents,
    tasks: changed("tasks") || previous === null ? new Map(model.tasks) : previous.tasks,
    sessions: sessionsMoved ? new Map(model.sessions) : previous.sessions,
    chat: changed("chat") || previous === null ? new Map(model.chat) : previous.chat,
    mail: changed("mail") || previous === null ? new Map(model.mail) : previous.mail,
    mandates:
      changed("mandates") || previous === null ? new Map(model.mandates) : previous.mandates,
    activeByAgent: sessionsMoved ? activeByAgent() : previous.activeByAgent,
  };
};

export const activeSessionOf = (snapshot: Snapshot, agentId: AgentId): Session | undefined =>
  snapshot.activeByAgent.get(agentId);

export const sortedFloors = (projects: ReadonlyMap<ProjectId, Project>): Project[] =>
  [...projects.values()].toSorted(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );

type UiState = {
  connection: Connection;
  replayed: boolean;
  offlineSince: number | null;
  snapshot: Snapshot;
  live: ReadonlyMap<SessionId, readonly LiveEvent[]>;
  selectedAgentId: AgentId | null;
  followAgentId: AgentId | null;
  floorId: ProjectId | null;
  addProjectOpen: boolean;
  setupOpen: boolean;
  setConnection: (connection: Connection) => void;
  setReplayed: (replayed: boolean) => void;
  selectAgent: (agentId: AgentId | null) => void;
  follow: (agentId: AgentId | null) => void;
  selectFloor: (floorId: ProjectId | null) => void;
  setAddProjectOpen: (open: boolean) => void;
  setSetupOpen: (open: boolean) => void;
};

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      connection: "connecting",
      replayed: false,
      offlineSince: null,
      snapshot: takeSnapshot(null),
      live: new Map(),
      selectedAgentId: null,
      followAgentId: null,
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
      follow: (followAgentId) => {
        set({ followAgentId });
      },
      selectFloor: (floorId) => {
        set({ floorId, selectedAgentId: null, followAgentId: null });
      },
      setAddProjectOpen: (addProjectOpen) => {
        set({ addProjectOpen });
      },
      setSetupOpen: (setupOpen) => {
        set({ setupOpen });
      },
    }),
    {
      name: "ho.ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ floorId: state.floorId }),
    },
  ),
);

export const useOnline = (): boolean => useUi((s) => s.connection === "online");

const BUMP_MS = 200;

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
export function scheduleModelBump(): void {
  if (!modelBumpScheduled) {
    modelBumpScheduled = true;
    nextBump(() => {
      modelBumpScheduled = false;
      const state = useUi.getState();
      const snapshot = takeSnapshot(state.snapshot);
      const { floorId, replayed } = state;
      const known = floorId !== null && snapshot.projects.has(floorId);
      useUi.setState(
        replayed && !known
          ? { snapshot, floorId: sortedFloors(snapshot.projects)[0]?.id ?? null }
          : { snapshot },
      );
    });
  }
}
