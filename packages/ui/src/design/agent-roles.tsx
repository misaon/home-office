import type { AgentRole } from "@ho/protocol";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useTranslation } from "react-i18next";
import { useDesign } from "./store.ts";
import { PickCard } from "./pick-card.tsx";

export const ROLE_MARKS: Record<AgentRole, React.JSX.Element> = {
  boss: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 11.5 4 5l3 3 1-4 1 4 3-3 1.5 6.5z" />
    </svg>
  ),
  worker: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="8" cy="5.6" r="2.4" />
      <path d="M3.4 13c.6-2.4 2.4-3.6 4.6-3.6S12 10.6 12.6 13" />
    </svg>
  ),
  reviewer: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6.9" cy="6.9" r="4.3" />
      <line x1="10.1" y1="10.1" x2="13.6" y2="13.6" />
      <polyline points="5.2,6.9 6.5,8.2 8.7,5.4" />
    </svg>
  ),
  clerk: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.4" y="4" width="11.2" height="8" rx="1.4" />
      <path d="m2.9 4.9 5.1 4 5.1-4" />
    </svg>
  ),
};

const offered = (value: AgentRole, bossTaken: boolean): AgentRole[] => {
  const cards: AgentRole[] = bossTaken ? ["worker"] : ["boss", "worker"];
  return cards.includes(value) ? cards : [...cards, value];
};

export function RoleCards({
  show,
  value,
  bossTaken,
  bossLocked,
  onPick,
}: {
  show: boolean;
  value: AgentRole;
  bossTaken: boolean;
  bossLocked: boolean;
  onPick: (role: AgentRole) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const cards = offered(value, bossTaken);
  const pick = (role: AgentRole): void => {
    if (role !== "boss" && bossLocked) {
      flash(t("agent.bossStays"));
      return;
    }
    onPick(role);
  };
  if (!show) {
    return null;
  }
  return (
    <RadioGroup
      aria-label={t("agent.whoTheyAre")}
      value={value}
      onValueChange={(next) => {
        pick(next);
      }}
      className={`grid gap-10 mb-18 ${cards.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
    >
      {cards.map((role) => (
        <PickCard
          key={role}
          value={role}
          mark={ROLE_MARKS[role]}
          title={t(`agent.role_${role}`)}
          hint={t(`agent.roleDesc_${role}`)}
          gap="gap-9"
        />
      ))}
    </RadioGroup>
  );
}
