import { create } from "zustand";
import { CREDS, STEPS, type Cred, type Step } from "./data-setup.ts";
import { FLOORS, type Card, type Floor, type Member } from "./data.ts";

export type Tab = "Chat" | "Board" | "Team" | "Usage" | "Settings";
type Sheet = { type: "task"; id: number } | { type: "agent"; idx: number } | null;
type Counts = { in: number; out: number; cache: number; sessions: number };
export type Window = "24 h" | "7 d" | "all";
export type NewAgent = {
  role: string;
  gender: string;
  provider: string;
  signin: string;
  model: string;
  effort: string;
};

export type Design = {
  tab: Tab;
  floorOpen: boolean;
  floorQuery: string;
  editor: boolean;
  setup: boolean;
  addAgent: boolean;
  draft: string;
  typing: boolean;
  toast: string | null;
  query: string;
  searchOpen: boolean;
  attachOpen: boolean;
  usageOpen: boolean;
  openSelect: string | null;
  attachment: string | null;
  lightbox: boolean;
  sheet: Sheet;
  sheetDraft: Member | null;
  boardFilter: string;
  teamFilter: string;
  credOpen: number | null;
  floorRowOpen: number | null;
  floorX: number;
  usageView: "Tokens" | "Resources";
  win: Window;
  counts: Counts;
  tool: string;
  matQuery: string;
  material: string;
  lang: string;
  officeName: string;
  officeFile: string;
  followOn: boolean;
  zoom: number;
  newName: string;
  newAgent: NewAgent;
  floorSel: number;
  floors: Floor[];
  creds: Cred[];
  steps: Step[];

  set: (patch: Partial<Design>) => void;
  update: (fn: (state: Design) => Partial<Design>) => void;
  /** The selected floor, changed in place: every panel edits the floor it is looking at. */
  patchCur: (patch: Partial<Floor>) => void;
  patchFloor: (index: number, patch: Partial<Floor>) => void;
  flash: (message: string) => void;
  send: () => void;
  runCounts: () => void;
  /** A new floor, from either the picker or Settings; both doors lead to the same room. */
  addFloor: () => void;
};

const TARGETS: Record<Window, Counts> = {
  "24 h": { in: 32, out: 1300, cache: 236_823, sessions: 6 },
  "7 d": { in: 214, out: 9480, cache: 1_284_530, sessions: 41 },
  all: { in: 512, out: 22_140, cache: 3_097_215, sessions: 97 },
};

const REPLIES = [
  "Queued on this floor. I will report back when the branch is pushed.",
  "Understood — picking it up now.",
  "Noted. I will split that into two tasks on the board.",
];

const pad = (value: number): string => String(value).padStart(2, "0");
const clock = (): string => {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

/** Thin spaces between thousands, the way the mockup writes every number. */
export const fmt = (n: number): string => String(n).replaceAll(/\B(?=(\d{3})+(?!\d))/gu, " ");

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let replyTimer: ReturnType<typeof setTimeout> | undefined;
let frame = 0;

const INITIAL = {
  tab: "Chat",
  floorOpen: false,
  floorQuery: "",
  editor: false,
  setup: false,
  addAgent: false,
  draft: "",
  typing: false,
  toast: null,
  query: "",
  searchOpen: false,
  attachOpen: false,
  usageOpen: false,
  openSelect: null,
  attachment: null,
  lightbox: false,
  sheet: null,
  sheetDraft: null,
  boardFilter: "all",
  teamFilter: "all",
  credOpen: null,
  floorRowOpen: 0,
  floorX: 190,
  usageView: "Tokens",
  win: "24 h",
  counts: { in: 0, out: 0, cache: 0, sessions: 0 },
  tool: "Wall",
  matQuery: "",
  material: "Brick",
  lang: "English",
  officeName: "New office",
  officeFile: "layouts/new-office.json",
  followOn: false,
  zoom: 100,
  newName: "",
  newAgent: {
    role: "worker",
    gender: "neutral",
    provider: "Claude Code",
    signin: "subscription",
    model: "Sonnet (latest)",
    effort: "high",
  },
  floorSel: 0,
  floors: FLOORS,
  creds: CREDS,
  steps: STEPS,
} satisfies Partial<Design>;

export const useDesign = create<Design>((set, get) => ({
  ...INITIAL,
  set: (patch) => {
    set(patch);
  },
  update: (fn) => {
    set(fn(get()));
  },
  patchCur: (patch) => {
    get().patchFloor(get().floorSel, patch);
  },
  patchFloor: (index, patch) => {
    const floors = [...get().floors];
    const floor = floors[index];
    if (floor === undefined) {
      return;
    }
    floors[index] = { ...floor, ...patch };
    set({ floors });
  },
  flash: (message) => {
    clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => {
      set({ toast: null });
    }, 2400);
  },

  addFloor: () => {
    const state = get();
    set({
      floorOpen: false,
      floors: state.floors.concat({
        name: `new-project-${String(state.floors.length + 1)}`,
        path: "/Users/ondrejmisak/WebstormProjects/new-project",
        pr: false,
        issues: false,
        services: false,
        issuesOpen: false,
        servicesOpen: false,
        team: [],
        cards: [],
        messages: [],
      }),
    });
    state.flash("Floor added — hire a boss in Team");
  },

  /** A message leaves, the boss answers a beat and a half later: the whole conversation this mockup has. */
  send: () => {
    const state = get();
    const text = state.draft.trim();
    const attachment = state.attachment;
    if (text === "" && attachment === null) {
      return;
    }
    const floor = state.floors[state.floorSel] ?? state.floors[0];
    if (floor === undefined) {
      return;
    }
    const boss = floor.team[0]?.name ?? "Andrew";
    const messages = floor.messages.concat({
      id: Date.now(),
      mine: true,
      time: clock(),
      text: text === "" ? "Have a look at this." : text,
      ...(attachment === null ? {} : { img: attachment }),
    });
    state.patchCur({ messages });
    set({ draft: "", attachment: null, attachOpen: false, typing: true, query: "" });
    clearTimeout(replyTimer);
    replyTimer = setTimeout(() => {
      const now = get();
      const current = now.floors[now.floorSel];
      if (current === undefined) {
        return;
      }
      now.patchCur({
        messages: current.messages.concat({
          id: Date.now() + 1,
          mine: false,
          who: boss,
          time: clock(),
          text: REPLIES[messages.length % REPLIES.length] ?? "",
        }),
      });
      set({ typing: false });
    }, 1500);
  },

  /** The totals count up to their window's figure over a second, eased out, as drawn. */
  runCounts: () => {
    cancelAnimationFrame(frame);
    const target = TARGETS[get().win];
    const start = performance.now();
    const step = (now: number): void => {
      const p = Math.min(1, (now - start) / 1000);
      const e = 1 - (1 - p) ** 3;
      set({
        counts: {
          in: Math.round(target.in * e),
          out: Math.round(target.out * e),
          cache: Math.round(target.cache * e),
          sessions: Math.round(target.sessions * e),
        },
      });
      if (p < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
  },
}));

/** The floor every panel is talking about. */
export const useFloor = (): Floor => useDesign((s) => s.floors[s.floorSel] ?? s.floors[0] ?? EMPTY);

const EMPTY: Floor = {
  name: "",
  path: "",
  pr: false,
  issues: false,
  services: false,
  issuesOpen: false,
  servicesOpen: false,
  team: [],
  cards: [],
  messages: [],
};

export const BOSS_FALLBACK: Member = {
  i: "?",
  name: "Nobody",
  role: "boss",
  provider: "",
  model: "",
  effort: "",
  status: "idle",
  doing: "",
  since: "",
  prompt: "",
};

export const countBy = (cards: Card[], status: string): number =>
  cards.filter((card) => card.s === status).length;
