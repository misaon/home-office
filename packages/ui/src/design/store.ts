import type { AgentId, AgentRole, AuthKind, Attachment, Gender, TaskId } from "@ho/protocol";
import type { FileChange } from "./transcript.ts";
import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Ask } from "./confirm.tsx";
import type { Lane, Member, ThreadPick } from "./data.ts";

export type Tab = "Chat" | "Board" | "Team" | "Usage" | "Settings";
type Sheet = { type: "task"; id: TaskId } | { type: "agent"; id: Member["id"] } | null;
export type Window = "24 h" | "7 d" | "all";

type AgentDialog = { mode: "new" } | { mode: "edit"; id: AgentId };

export type AgentDraft = {
  name: string;
  role: AgentRole;
  gender: Gender;
  provider: string;
  auth: AuthKind;
  model: string;
  effort: string;
  prompt: string;
};
export type Design = {
  tab: Tab;
  floorQuery: string;
  editor: boolean;
  draft: string;
  thread: ThreadPick | "new";
  toast: string | null;
  query: string;
  searchOpen: boolean;
  attachment: Attachment | null;
  lightbox: Attachment | null;
  diff: FileChange | null;
  sheet: Sheet;
  sheetDraft: Member | null;
  agentDlg: AgentDialog | null;
  agentDraft: AgentDraft | null;
  boardFilter: Lane | "all";
  teamFilter: "all" | "working" | "idle";
  ask: Ask | null;
  usageView: "Tokens" | "Resources";
  win: Window;

  set: (patch: Partial<Design> | ((state: Design) => Partial<Design>)) => void;
  confirm: (ask: Ask) => void;
  flash: (message: string) => void;
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;

const INITIAL = {
  tab: "Chat",
  floorQuery: "",
  editor: false,
  draft: "",
  thread: "new",
  toast: null,
  query: "",
  searchOpen: false,
  attachment: null,
  lightbox: null,
  diff: null,
  sheet: null,
  sheetDraft: null,
  agentDlg: null,
  agentDraft: null,
  boardFilter: "all",
  teamFilter: "all",
  ask: null,
  usageView: "Tokens",
  win: "24 h",
} satisfies Partial<Design>;

export const useDesign = create<Design>()(
  persist(
    (set) => ({
      ...INITIAL,
      set: (patch) => {
        set(patch);
      },
      confirm: (ask) => {
        set({ ask });
      },
      flash: (message) => {
        clearTimeout(toastTimer);
        set({ toast: message });
        toastTimer = setTimeout(() => {
          set({ toast: null });
        }, 2400);
      },
    }),
    {
      name: "ho.design",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tab: state.tab,
        draft: state.draft,
        thread: state.thread,
        boardFilter: state.boardFilter,
        teamFilter: state.teamFilter,
        usageView: state.usageView,
        win: state.win,
      }),
    },
  ),
);

export function useOfficeMutation<TData, TVariables>(
  options: UseMutationOptions<TData, Error, TVariables>,
): UseMutationResult<TData, Error, TVariables> {
  const flash = useDesign((s) => s.flash);
  return useMutation({
    ...options,
    onError: (error, variables, onMutateResult, context) => {
      flash(error.message);
      return options.onError?.(error, variables, onMutateResult, context);
    },
  });
}

export const fmt = (n: number): string => String(n).replaceAll(/\B(?=(?:\d{3})+(?!\d))/gu, " ");
