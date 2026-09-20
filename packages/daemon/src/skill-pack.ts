import type { Agent, SessionMode } from "@ho/protocol";

const MODE_PACK: Readonly<Record<SessionMode, string | null>> = {
  work: "work",
  review: "review",
  triage: null,
  plan: null,
  verify: "verify",
};

export const skillPacksFor = (agent: Agent, mode: SessionMode): string[] => {
  const packs = [MODE_PACK[mode], agent.skillPack].filter(
    (pack): pack is string => pack !== null && pack !== "none",
  );
  return [...new Set(packs)];
};
