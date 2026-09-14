import type { AgentId, AgentRole, AuthKind, Attachment, Gender, TaskId } from "@ho/protocol";
import { create } from "zustand";
import type { Ask } from "./confirm.tsx";
import type { Lane, Member } from "./data.ts";

export type Tab = "Chat" | "Board" | "Team" | "Usage" | "Settings";
type Sheet = { type: "task"; id: TaskId } | { type: "agent"; id: Member["id"] } | null;
export type Window = "24 h" | "7 d" | "all";

/** Hiring someone, or changing someone already here. */
type AgentDialog = { mode: "new" } | { mode: "edit"; id: AgentId };

/** Everything the agent dialog can change, before any of it is sent. */
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
/**
 * What the office is *showing*, as opposed to what it *is*: which panel is open, which popover, what is
 * half-typed. Everything with a fact behind it lives in the daemon and arrives through `../store.ts`.
 */
export type Design = {
  tab: Tab;
  floorOpen: boolean;
  floorQuery: string;
  floorX: number;
  editor: boolean;
  draft: string;
  toast: string | null;
  query: string;
  searchOpen: boolean;
  attachOpen: boolean;
  usageOpen: boolean;
  openSelect: string | null;
  attachment: Attachment | null;
  lightbox: Attachment | null;
  sheet: Sheet;
  sheetDraft: Member | null;
  /** The agent dialog, open over everything, and the draft it is editing. */
  agentDlg: AgentDialog | null;
  agentDraft: AgentDraft | null;
  boardFilter: Lane | "all";
  teamFilter: "all" | "working" | "idle";
  credOpen: string | null;
  floorRowOpen: string | null;
  openIntake: string | null;
  openServices: string | null;
  /** What the office is about to do that cannot be undone, and how it says so. */
  ask: Ask | null;
  usageView: "Tokens" | "Resources";
  win: Window;

  set: (patch: Partial<Design>) => void;
  confirm: (ask: Ask) => void;
  update: (fn: (state: Design) => Partial<Design>) => void;
  flash: (message: string) => void;
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;

const INITIAL = {
  tab: "Chat",
  floorOpen: false,
  floorQuery: "",
  floorX: 190,
  editor: false,
  draft: "",
  toast: null,
  query: "",
  searchOpen: false,
  attachOpen: false,
  usageOpen: false,
  openSelect: null,
  attachment: null,
  lightbox: null,
  sheet: null,
  sheetDraft: null,
  agentDlg: null,
  agentDraft: null,
  boardFilter: "all",
  teamFilter: "all",
  credOpen: null,
  floorRowOpen: null,
  openIntake: null,
  openServices: null,
  ask: null,
  usageView: "Tokens",
  win: "24 h",
} satisfies Partial<Design>;

export const useDesign = create<Design>((set) => ({
  ...INITIAL,
  set: (patch) => {
    set(patch);
  },
  /** The office never deletes without asking; this is the asking. */
  confirm: (ask) => {
    set({ ask });
  },
  update: (fn) => {
    set(fn);
  },
  /** What just happened, said once and then gone. */
  flash: (message) => {
    clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => {
      set({ toast: null });
    }, 2400);
  },
}));

/** Thin spaces between thousands, the way the design writes every number. */
export const fmt = (n: number): string => String(n).replaceAll(/\B(?=(\d{3})+(?!\d))/gu, " ");
