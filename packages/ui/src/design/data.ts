/**
 * The floors, credentials and setup steps the design was drawn against. The mockup is a picture of a
 * working office, not a connection to one: every number here is a fixture, and it stays a fixture until
 * the panels are wired to the daemon. Keeping the exact values is what makes the port checkable against
 * the original drawing.
 */

type CardStatus = "running" | "blocked" | "done";
export type Priority = "high" | "normal" | "low";
type Role = "boss" | "worker";
type Presence = "working" | "idle";

export type Member = {
  i: string;
  name: string;
  role: Role;
  provider: string;
  model: string;
  effort: string;
  status: Presence;
  doing: string;
  since: string;
  prompt: string;
  gender?: string;
  signin?: string;
};

export type Card = {
  id: number;
  t: string;
  p: Priority;
  k: "code" | "triage";
  who: string;
  s: CardStatus;
  at: string;
};

export type Message = {
  id: number;
  mine: boolean;
  who?: string;
  time: string;
  text: string;
  img?: string;
};

export type Floor = {
  name: string;
  path: string;
  pr: boolean;
  issues: boolean;
  services: boolean;
  issuesOpen: boolean;
  servicesOpen: boolean;
  team: Member[];
  cards: Card[];
  messages: Message[];
};
export const FLOORS: Floor[] = [
  {
    name: "dbg-webs-monorepo",
    path: "/Users/ondrejmisak/WebstormProjects/dbg-webs-monorepo",
    pr: false,
    issues: false,
    services: false,
    issuesOpen: false,
    servicesOpen: false,
    team: [
      {
        i: "A",
        name: "Andrew",
        role: "boss",
        provider: "Claude Code",
        model: "Opus",
        effort: "low",
        status: "working",
        doing: "Refactoring the auth session handling",
        since: "started 41 minutes ago · 12 tool calls",
        prompt:
          "You run this floor. Triage incoming mail into tasks, delegate to workers and keep the board honest.",
      },
      {
        i: "B",
        name: "Bea",
        role: "worker",
        provider: "Claude Code",
        model: "Sonnet",
        effort: "high",
        status: "idle",
        doing: "Waiting for work",
        since: "idle for 12 minutes",
        prompt: "You take one task at a time, write tests first and push a branch when green.",
      },
    ],
    cards: [
      {
        id: 1,
        t: "Refactor the auth session handling",
        p: "high",
        k: "code",
        who: "Andrew",
        s: "running",
        at: "21:52",
      },
      {
        id: 2,
        t: "What exactly is in the attachment?",
        p: "normal",
        k: "triage",
        who: "Andrew",
        s: "blocked",
        at: "21:38",
      },
      {
        id: 3,
        t: "Wire up the changelog generator",
        p: "low",
        k: "triage",
        who: "Bea",
        s: "blocked",
        at: "20:14",
      },
      {
        id: 4,
        t: "Bump Chromium in the agent image",
        p: "normal",
        k: "code",
        who: "Bea",
        s: "done",
        at: "19:02",
      },
      {
        id: 5,
        t: "What is today’s date?",
        p: "low",
        k: "triage",
        who: "Andrew",
        s: "done",
        at: "18:40",
      },
      {
        id: 6,
        t: "How are you doing?",
        p: "low",
        k: "triage",
        who: "Andrew",
        s: "done",
        at: "18:22",
      },
      {
        id: 7,
        t: "First-run check of Home Office",
        p: "normal",
        k: "triage",
        who: "Andrew",
        s: "done",
        at: "17:55",
      },
    ],
    messages: [
      { id: 1, mine: true, time: "20:53:45", text: "Morning — what is on the floor today?" },
      {
        id: 2,
        mine: false,
        who: "Andrew",
        time: "20:54:05",
        text: "Two tasks open, nothing blocked. Andrew here, ready.",
      },
      {
        id: 3,
        mine: true,
        time: "20:56:20",
        text: "Ship the auth refactor first, then the changelog generator.",
      },
      {
        id: 4,
        mine: false,
        who: "Andrew",
        time: "20:57:36",
        text: "On it. Starting the auth refactor now — I will open a pull request once the tests pass.",
      },
      {
        id: 5,
        mine: true,
        time: "21:38:24",
        text: "Is this the floor plan you meant?",
        img: "floor-plan.png",
      },
      {
        id: 6,
        mine: false,
        who: "Andrew",
        time: "21:39:02",
        text: "Yes. I will use it for the meeting room on the east wall.",
      },
    ],
  },
  {
    name: "techfides-portal",
    path: "/Users/ondrejmisak/WebstormProjects/techfides-portal",
    pr: true,
    issues: true,
    services: false,
    issuesOpen: false,
    servicesOpen: false,
    team: [
      {
        i: "M",
        name: "Mia",
        role: "boss",
        provider: "Claude Code",
        model: "Sonnet",
        effort: "medium",
        status: "idle",
        doing: "Waiting for the next issue",
        since: "idle for 2 hours",
        prompt: "You keep the portal green. Every incoming issue becomes a task with a test.",
      },
    ],
    cards: [
      {
        id: 11,
        t: "Fix the invoice PDF margins",
        p: "normal",
        k: "code",
        who: "Mia",
        s: "running",
        at: "15:20",
      },
      {
        id: 12,
        t: "Issue #481: login loop on Safari",
        p: "high",
        k: "triage",
        who: "Mia",
        s: "blocked",
        at: "14:02",
      },
      {
        id: 13,
        t: "Upgrade the portal to Node 22",
        p: "low",
        k: "code",
        who: "Mia",
        s: "done",
        at: "11:36",
      },
    ],
    messages: [
      { id: 1, mine: true, time: "14:01:10", text: "Anything from the issue tracker?" },
      {
        id: 2,
        mine: false,
        who: "Mia",
        time: "14:02:30",
        text: "Issue #481 arrived — login loop on Safari. I can reproduce it, so I blocked the task until you confirm the fix direction.",
      },
    ],
  },
];
