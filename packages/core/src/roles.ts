import type { AgentRole } from "@ho/protocol";

const ROLE_PACK: Readonly<Record<AgentRole, string>> = {
  boss: "boss",
  secretary: "secretary",
  analyst: "analyst",
  backend: "backend",
  frontend: "frontend",
  devops: "devops",
  qa: "qa",
  security: "security",
  head: "head",
  developer: "developer",
};

export const rolePack = (role: AgentRole): string => ROLE_PACK[role];
