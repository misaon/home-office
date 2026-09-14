import type { Member } from "./data.ts";
import { MONO } from "./tokens.ts";

/** What this colleague is at right now, and for how long. */
export function AgentStatus({ draft }: { draft: Member }): React.JSX.Element {
  const dot = draft.status === "working" ? "#FFC531" : "#8E8B85";
  return (
    <div
      style={{
        padding: "14px",
        borderRadius: "14px",
        background: "#111114",
        border: "1px solid #26262C",
        marginBottom: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: dot,
            boxShadow: `0 0 10px ${dot}`,
            flex: "0 0 auto",
          }}
        />
        <div style={{ flex: "1", minWidth: "0" }}>
          <div style={{ fontSize: "13px" }}>{draft.doing}</div>
          <div style={{ ...MONO, fontSize: "10.5px", color: "#A6A39C", marginTop: "3px" }}>
            {draft.since}
          </div>
        </div>
      </div>
    </div>
  );
}
