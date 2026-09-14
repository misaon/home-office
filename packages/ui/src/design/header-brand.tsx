import { DISPLAY } from "./tokens.ts";

/** The office's mark and its name. */
export function HeaderBrand(): React.JSX.Element {
  return (
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
  );
}
