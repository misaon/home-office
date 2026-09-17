import type { Agent, SessionMode } from "@ho/protocol";

const PACK_BY_MODE: Readonly<Record<SessionMode, string | null>> = {
  work: "worker",
  review: "reviewer",
  triage: null,
};

export const skillPackFor = (agent: Agent, mode: SessionMode): string =>
  agent.skillPack === "none" ? "none" : (PACK_BY_MODE[mode] ?? agent.skillPack);
