import { DISPLAY } from "./tokens.ts";

/** The office's mark and name, and the dot that says every floor is live. */
export function HeaderBrand(): React.JSX.Element {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "0 0 auto" }}>
        <div
          style={{
            width: "19px",
            height: "19px",
            borderRadius: "6px",
            background: "var(--a,#FFC531)",
            animation: "breathe 4.5s ease-in-out infinite",
          }}
        />
        <span
          style={{
            ...DISPLAY,
            fontWeight: "700",
            fontSize: "12.5px",
            letterSpacing: ".17em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          Home Office
        </span>
      </div>
      <div
        title="all floors live"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "5px",
          borderRadius: "99px",
          flex: "0 0 auto",
          background: "rgba(91,217,160,.1)",
          border: "1px solid rgba(91,217,160,.26)",
        }}
      >
        <span
          style={{ position: "relative", width: "6px", height: "6px", display: "inline-block" }}
        >
          <span
            style={{ position: "absolute", inset: "0", borderRadius: "50%", background: "#5BD9A0" }}
          />
          <span
            style={{
              position: "absolute",
              inset: "0",
              borderRadius: "50%",
              background: "#5BD9A0",
              animation: "ring 2.4s ease-out infinite",
            }}
          />
        </span>
      </div>
    </>
  );
}
