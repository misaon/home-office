import type { AgentRole, Gender } from "@ho/protocol";

/** Dictionary keys for the closed lists the panels show as choices, so no raw enum value reaches the screen. */
export const ROLE_KEY = {
  boss: "roles.boss",
  worker: "roles.worker",
  reviewer: "roles.reviewer",
  clerk: "roles.clerk",
} as const satisfies Record<AgentRole, string>;

export const GENDER_KEY = {
  female: "genders.female",
  male: "genders.male",
  neutral: "genders.neutral",
} as const satisfies Record<Gender, string>;
