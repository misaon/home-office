import type { Member } from "./data.ts";
import { DISPLAY, MONO, separator } from "./tokens.ts";

const INNER: React.CSSProperties = {
  flex: "1",
  minWidth: "0",
  padding: "13px",
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const AVATAR: React.CSSProperties = {
  width: "34px",
  height: "34px",
  flex: "0 0 34px",
  borderRadius: "11px",
  display: "grid",
  placeItems: "center",
  ...DISPLAY,
  fontWeight: "700",
  fontSize: "14px",
};

const NAME: React.CSSProperties = {
  ...DISPLAY,
  fontWeight: "600",
  fontSize: "14px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const ROLE: React.CSSProperties = {
  ...MONO,
  fontSize: "9.5px",
  padding: "2px 7px",
  borderRadius: "99px",
  flex: "0 0 auto",
};

const META: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  marginTop: "6px",
  ...MONO,
  fontSize: "10px",
  color: "#A6A39C",
  flexWrap: "wrap",
};

const DOT: React.CSSProperties = { width: "5px", height: "5px", borderRadius: "50%" };

/** One colleague as a row: who they are, what they are on, and the arrow into their sheet. */
export function TeamRow({
  person,
  first,
  onOpen,
}: {
  person: Member;
  first: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const working = person.status === "working";
  const chief = person.role === "boss";
  const accent = working ? "var(--a,#FFC531)" : "#3A3A41";

  return (
    <div
      // Kept the same element as the board's rows, which cannot be a button.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="button"
      aria-label={person.name}
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: "flex",
        alignItems: "stretch",
        cursor: "pointer",
        borderTop: `1px solid ${separator(first)}`,
        transition: "background .2s",
      }}
      className="hopg"
    >
      <div style={{ width: "3px", flex: "0 0 3px", background: accent }} />
      <div style={INNER}>
        <div
          style={{
            ...AVATAR,
            background: chief ? "linear-gradient(145deg,#FFD666,#E0A400)" : "#24242A",
            color: chief ? "#1A1300" : "#D6D3CD",
          }}
        >
          <span>{person.i}</span>
        </div>
        <div style={{ flex: "1", minWidth: "0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <span style={NAME}>{person.name}</span>
            <span
              style={{
                ...ROLE,
                background: chief ? "rgba(255,197,49,.2)" : "#24242A",
                color: chief ? "#FFD666" : "#BEBBB4",
              }}
            >
              {person.role}
            </span>
          </div>
          <div style={META}>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                color: working ? "#FFD666" : "#A6A39C",
              }}
            >
              <span style={{ ...DOT, background: accent }} />
              <span>{person.status}</span>
            </span>
            <span style={{ opacity: ".4" }}>·</span>
            <span>{`${person.model.toLowerCase()} / ${person.effort}`}</span>
          </div>
        </div>
        <svg
          style={{ flex: "0 0 auto" }}
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="#8E8B85"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <polyline points="4.5,3 8,6 4.5,9" />
        </svg>
      </div>
    </div>
  );
}
