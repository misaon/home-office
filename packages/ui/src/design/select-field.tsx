import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

/** The caption every field in a dialog is labelled with. */
const LABEL: React.CSSProperties = {
  ...MONO,
  fontSize: "9.5px",
  letterSpacing: ".16em",
  textTransform: "uppercase",
  color: "#ABA8A1",
  marginBottom: "8px",
};

const TRIGGER: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  padding: "12px 13px",
  borderRadius: "12px",
  background: "#101013",
  fontSize: "12.5px",
  cursor: "pointer",
  textAlign: "left",
  transition: "all .2s",
};

const LIST: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: "0",
  right: "0",
  marginTop: "6px",
  padding: "5px",
  borderRadius: "11px",
  background: "#17171C",
  border: "1px solid #2C2C32",
  boxShadow: "0 20px 44px rgba(0,0,0,.66)",
  zIndex: 45,
  animation: "riseIn .24s cubic-bezier(.2,.9,.3,1.05) both",
};

const OPTION: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 9px",
  borderRadius: "8px",
  border: "0",
  cursor: "pointer",
  textAlign: "left",
  fontSize: "12.5px",
  transition: "all .18s",
};

const ELLIPSIS: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * The design's own dropdown: a button that opens a list under itself. One open select at a time,
 * tracked by `scope:name`, which is how the mockup keeps two forms from opening together.
 */
export function SelectField({
  scope,
  name,
  label,
  options,
  value,
  mono = false,
  muted = false,
  onPick,
}: {
  scope: string;
  name: string;
  label: string;
  options: readonly string[];
  value: string;
  /** Branches and paths are written in the office's monospace, names and models are not. */
  mono?: boolean;
  /** A value that is a placeholder rather than a choice. */
  muted?: boolean;
  onPick: (next: string) => void;
}): React.JSX.Element {
  const openSelect = useDesign((s) => s.openSelect);
  const set = useDesign((s) => s.set);
  const update = useDesign((s) => s.update);
  const id = `${scope}:${name}`;
  const open = openSelect === id;

  return (
    <div style={{ position: "relative" }}>
      <div style={LABEL}>{label}</div>
      <button
        type="button"
        onClick={() => {
          update((s) => ({
            openSelect: s.openSelect === id ? null : id,
            attachOpen: false,
            usageOpen: false,
          }));
        }}
        style={{
          ...TRIGGER,
          ...(mono ? MONO : {}),
          ...(mono ? { fontSize: "12px" } : {}),
          border: `1px solid ${open ? "rgba(255,197,49,.5)" : "#2C2C32"}`,
        }}
        className="ho-13397d"
      >
        <span style={{ ...ELLIPSIS, ...(muted ? { color: "#8A8780" } : {}) }}>{value}</span>
        <svg
          style={{
            flex: "0 0 auto",
            transition: "transform .25s",
            transform: `rotate(${open ? "180deg" : "0deg"})`,
          }}
          width="9"
          height="9"
          viewBox="0 0 12 12"
          fill="none"
          stroke="#A6A39C"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <polyline points="3,4.5 6,8 9,4.5" />
        </svg>
      </button>
      {open ? (
        <div style={LIST}>
          {options.map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => {
                onPick(option);
                set({ openSelect: null });
              }}
              style={{
                ...OPTION,
                ...(mono ? MONO : {}),
                ...(mono ? { fontSize: "12px" } : {}),
                background: option === value ? "rgba(255,197,49,.12)" : "transparent",
                color: option === value ? "#FFD666" : "#E9E7E2",
              }}
              className="ho-891815"
            >
              <span
                style={{
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  flex: "0 0 auto",
                  background: option === value ? "var(--a,#FFC531)" : "#3A3A41",
                }}
              />
              <span style={ELLIPSIS}>{option}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
