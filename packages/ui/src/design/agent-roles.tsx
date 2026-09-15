import type { AgentRole } from "@ho/protocol";
import { useTranslation } from "react-i18next";

/**
 * Who this colleague is. The office hires two of its four roles here — the boss, while the floor has
 * none, and the worker — which is what the drawing shows. A reviewer or a clerk still exists (the CLI
 * hires them, and a review needs one), so if this colleague is already one, their card is shown too
 * rather than letting the dialog say they are something else.
 */

const MARKS: Record<AgentRole, React.JSX.Element> = {
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

const CARD =
  "relative flex flex-col items-start gap-9 p-14 rounded-14 cursor-pointer text-left transition-all duration-240 ease-soft";

const TICK = "absolute top-12 right-12 w-16 h-16 rounded-half bg-accent grid place-items-center";

function RoleCard({
  role,
  on,
  onPick,
}: {
  role: AgentRole;
  on: boolean;
  onPick: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onPick}
      className={`hover:-translate-y-2 hover:border-accent-a50 ${CARD} border ${on ? "border-accent-a45" : "border-border"} ${on ? "bg-accent-a07" : "bg-card"}`}
    >
      <span
        className={`w-30 h-30 rounded-10 grid place-items-center ${on ? "bg-accent-a16" : "bg-tile"} ${on ? "text-accent-soft" : "text-ink-faint"}`}
      >
        {MARKS[role]}
      </span>
      <span className="block">
        <span
          className={`block text-13 font-semibold ${on ? "text-accent-soft" : "text-ink-warm"}`}
        >
          {t(`agent.role_${role}`)}
        </span>
        <span className="block text-11h text-ink-meta mt-4 leading-body">
          {t(`agent.roleDesc_${role}`)}
        </span>
      </span>
      {on ? (
        <span className={TICK}>
          <svg
            className="stroke-accent-ink"
            width="9"
            height="9"
            viewBox="0 0 10 10"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="1.8,5.2 4,7.4 8.2,2.6" />
          </svg>
        </span>
      ) : null}
    </button>
  );
}

/** The boss only while the chair is free, the worker always, and this colleague's own role if it is
 *  neither of those. */
const offered = (value: AgentRole, bossTaken: boolean): AgentRole[] => {
  const cards: AgentRole[] = bossTaken ? ["worker"] : ["boss", "worker"];
  return cards.includes(value) ? cards : [...cards, value];
};

/** The cards this floor can hire, one row of them. */
export function RoleCards({
  value,
  bossTaken,
  onPick,
}: {
  value: AgentRole;
  /** Whether this floor already has a boss other than the colleague being edited. */
  bossTaken: boolean;
  onPick: (role: AgentRole) => void;
}): React.JSX.Element {
  const cards = offered(value, bossTaken);
  return (
    <div className={`grid gap-10 mb-18 ${cards.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {cards.map((role) => (
        <RoleCard
          key={role}
          role={role}
          on={role === value}
          onPick={() => {
            onPick(role);
          }}
        />
      ))}
    </div>
  );
}
