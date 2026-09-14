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

const CARD: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "9px",
  padding: "14px",
  borderRadius: "14px",
  cursor: "pointer",
  textAlign: "left",
  transition: "all .24s cubic-bezier(.2,.8,.3,1)",
};

const TICK: React.CSSProperties = {
  position: "absolute",
  top: "12px",
  right: "12px",
  width: "16px",
  height: "16px",
  borderRadius: "50%",
  background: "var(--a,#FFC531)",
  display: "grid",
  placeItems: "center",
};

const TAKEN: React.CSSProperties = {
  ...MONO,
  fontSize: "9px",
  padding: "2px 6px",
  borderRadius: "5px",
  background: "#24242A",
  color: "#BEBBB4",
  whiteSpace: "nowrap",
};

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
      style={{
        ...CARD,
        border: `1px solid ${on ? "rgba(255,197,49,.45)" : "#26262C"}`,
        background: on ? "rgba(255,197,49,.07)" : "#101013",
        opacity: taken && !on ? ".72" : "1",
      }}
      className="ho-4f6a3c"
    >
      <span
        style={{
          width: "30px",
          height: "30px",
          borderRadius: "10px",
          display: "grid",
          placeItems: "center",
          background: on ? "rgba(255,197,49,.16)" : "#1D1D22",
          color: on ? "#FFD666" : "#BEBBB4",
        }}
      >
        {MARKS[role]}
      </span>
      <span style={{ display: "block" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", fontWeight: "600", color: on ? "#FFD666" : "#F2EFE8" }}>
            {t(`agent.role_${role}`)}
          </span>
          {taken ? <span style={TAKEN}>{t("agent.roleTaken", { name: takenBy })}</span> : null}
        </span>
        <span
          style={{
            display: "block",
            fontSize: "11.5px",
            color: "#A6A39C",
            marginTop: "4px",
            lineHeight: "1.5",
          }}
        >
          {t(`agent.roleDesc_${role}`)}
        </span>
      </span>
      {on ? (
        <span style={TICK}>
          <svg
            width="9"
            height="9"
            viewBox="0 0 10 10"
            fill="none"
            stroke="#150F02"
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "10px",
        marginBottom: "18px",
      }}
    >
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
