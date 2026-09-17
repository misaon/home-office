import type { AgentRole, Gender } from "@ho/protocol";

export const ROLE_KEY = {
  boss: "roles.boss",
  secretary: "roles.secretary",
  analyst: "roles.analyst",
  backend: "roles.backend",
  frontend: "roles.frontend",
  devops: "roles.devops",
  qa: "roles.qa",
  security: "roles.security",
  head: "roles.head",
  developer: "roles.developer",
} as const satisfies Record<AgentRole, string>;

export const GENDER_KEY = {
  female: "genders.female",
  male: "genders.male",
  neutral: "genders.neutral",
} as const satisfies Record<Gender, string>;
