import type { AgentRole } from "@ho/protocol";
import { DISPLAY } from "./tokens.ts";

const ROLE_TINT: Readonly<Record<AgentRole, string>> = {
  boss: "bg-gold text-accent-ink-deep",
  secretary: "bg-role-secretary/20 text-role-secretary",
  analyst: "bg-role-analyst/20 text-role-analyst",
  backend: "bg-role-people/20 text-role-people",
  frontend: "bg-role-people/20 text-role-people",
  devops: "bg-role-people/20 text-role-people",
  developer: "bg-role-people/20 text-role-people",
  qa: "bg-role-qa/20 text-role-qa",
  security: "bg-role-security/20 text-role-security",
  head: "bg-role-head/20 text-role-head",
};

const SIZE = {
  sm: "w-20 h-20 flex-[0_0_20px] rounded-7 text-10",
  md: "w-26 h-26 flex-[0_0_26px] rounded-9 text-12",
} as const;

export function Avatar({
  initial,
  role,
  size = "md",
}: {
  initial: string;
  role: AgentRole;
  size?: keyof typeof SIZE;
}): React.JSX.Element {
  return (
    <span
      className={`${SIZE[size]} grid place-items-center ${DISPLAY} font-bold leading-none ${ROLE_TINT[role]}`}
    >
      {initial}
    </span>
  );
}
