import type { Attachment, TaskId } from "@ho/protocol";
import { create } from "zustand";
import type { Lane, Member } from "./data.ts";

export type Tab = "Chat" | "Board" | "Team" | "Usage" | "Settings";
type Sheet = { type: "task"; id: TaskId } | { type: "agent"; id: Member["id"] } | null;
export type Window = "24 h" | "7 d" | "all";
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
  addAgent: boolean;
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
  boardFilter: Lane | "all";
  teamFilter: "all" | "working" | "idle";
  credOpen: string | null;
  floorRowOpen: string | null;
  openIntake: string | null;
  openServices: string | null;
  usageView: "Tokens" | "Resources";
  win: Window;

  set: (patch: Partial<Design>) => void;
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
  addAgent: false,
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
  boardFilter: "all",
  teamFilter: "all",
  credOpen: null,
  floorRowOpen: null,
  openIntake: null,
  openServices: null,
  usageView: "Tokens",
  win: "24 h",
} satisfies Partial<Design>;

export const useDesign = create<Design>((set) => ({
  ...INITIAL,
  set: (patch) => {
    set(patch);
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
