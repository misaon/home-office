import type { Member } from "./data.ts";

const X = ["22%", "62%", "44%", "76%"];
const Y = ["54%", "22%", "70%", "46%"];

/** One colleague on the floor plan: a disc that drifts, and a label saying what they are at. */
export function Puck({ person, index }: { person: Member; index: number }): React.JSX.Element {
  const busy = person.status === "working";
  return (
    <div
      style={{
        position: "absolute",
        animation: `${index % 2 === 1 ? "float2 8.5s" : "float1 7s"} ease-in-out infinite`,
        left: X[index],
        top: Y[index],
      }}
    >
      <div style={{ position: "relative", width: "42px", height: "42px" }}>
        <div
          style={{
            position: "absolute",
            inset: "0",
            borderRadius: "50%",
            background: "#22232B",
            boxShadow: "0 10px 24px rgba(0,0,0,.34)",
          }}
        />
        {busy ? (
          <div
            style={{
              position: "absolute",
              inset: "-6px",
              borderRadius: "50%",
              border: "1.5px solid rgba(255,197,49,.55)",
              animation: "ring 3.2s ease-out infinite",
            }}
          />
        ) : null}
      </div>
      <div
        style={{
          marginTop: "9px",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 9px",
          borderRadius: "99px",
          background: "rgba(12,12,14,.92)",
          border: `1px solid ${busy ? "rgba(255,197,49,.35)" : "#34343B"}`,
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            background: busy ? "#FFC531" : "#8E8B85",
          }}
        />
        <span
          style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", color: "#F2EFE8" }}
        >
          {`${person.name} · ${person.status}`}
        </span>
      </div>
    </div>
  );
}
