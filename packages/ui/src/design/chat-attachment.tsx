import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

const CHIP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  padding: "7px 9px",
  borderRadius: "10px",
  background: "rgba(255,197,49,.09)",
  border: "1px solid rgba(255,197,49,.28)",
  marginBottom: "10px",
  animation: "riseIn .3s ease both",
};

const SWATCH: React.CSSProperties = {
  width: "22px",
  height: "22px",
  flex: "0 0 22px",
  borderRadius: "6px",
  backgroundImage:
    "repeating-linear-gradient(135deg,rgba(255,197,49,.4) 0 4px,rgba(255,197,49,.12) 4px 8px)",
};

const NAME: React.CSSProperties = {
  flex: "1",
  minWidth: "0",
  ...MONO,
  fontSize: "11px",
  color: "#FFD666",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const CLEAR: React.CSSProperties = {
  width: "20px",
  height: "20px",
  flex: "0 0 20px",
  display: "grid",
  placeItems: "center",
  border: "0",
  borderRadius: "6px",
  background: "transparent",
  color: "#E4C778",
  cursor: "pointer",
  transition: "all .2s",
};

/** What is hanging on the message you have not sent yet. */
export function ChatAttachment({ file }: { file: string }): React.JSX.Element {
  const set = useDesign((s) => s.set);
  return (
    <div style={CHIP}>
      <span style={SWATCH} />
      <span style={NAME}>{file}</span>
      <button
        type="button"
        aria-label="Remove the attachment"
        onClick={() => {
          set({ attachment: null });
        }}
        style={CLEAR}
        className="hopb"
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 10 10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <line x1="2" y1="2" x2="8" y2="8" />
          <line x1="8" y1="2" x2="2" y2="8" />
        </svg>
      </button>
    </div>
  );
}
