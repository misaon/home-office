import { AgentRole } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { MONO } from "./tokens.ts";

/**
 * Who this colleague is, as four cards. The drawing has two — the boss and the worker it was drawn
 * against — and the office has four roles; the two extra cards are the same card, and their marks are
 * drawn in the same hand: one stroke weight, one corner radius, one 16-unit box.
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

const TAKEN = `${MONO} text-9 py-2 px-6 rounded-5 bg-edge-lit text-ink-faint whitespace-nowrap`;

function RoleCard({
  role,
  on,
  taken,
  takenBy,
  onPick,
}: {
  role: AgentRole;
  on: boolean;
  taken: boolean;
  takenBy: string;
  onPick: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onPick}
      className={`hover:-translate-y-2 hover:border-accent-a50 ${CARD} border ${on ? "border-accent-a45" : "border-border"} ${on ? "bg-accent-a07" : "bg-card"} ${taken && !on ? "opacity-72" : "opacity-100"}`}
    >
      <span
        className={`w-30 h-30 rounded-10 grid place-items-center ${on ? "bg-accent-a16" : "bg-tile"} ${on ? "text-accent-soft" : "text-ink-faint"}`}
      >
        {MARKS[role]}
      </span>
      <span className="block">
        <span className="flex items-center gap-7 flex-wrap">
          <span className={`text-13 font-semibold ${on ? "text-accent-soft" : "text-ink-warm"}`}>
            {t(`agent.role_${role}`)}
          </span>
          {taken ? <span className={TAKEN}>{t("agent.roleTaken", { name: takenBy })}</span> : null}
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

/** The four cards, with the floor's current boss named on the one that is already taken. */
export function RoleCards({
  value,
  bossName,
  onPick,
}: {
  value: AgentRole;
  /** The boss of this floor, when it is somebody other than the agent being edited. */
  bossName: string | null;
  onPick: (role: AgentRole) => void;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-10 mb-18">
      {AgentRole.options.map((role) => (
        <RoleCard
          key={role}
          role={role}
          on={role === value}
          taken={role === "boss" && bossName !== null}
          takenBy={bossName ?? ""}
          onPick={() => {
            onPick(role);
          }}
        />
      ))}
    </div>
  );
}
