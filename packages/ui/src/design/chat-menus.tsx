import { fmt, useDesign } from "./store.ts";

const ATTACH_OPTIONS = [
  { name: "Snapshot of this floor", file: "floor-snapshot.png", kind: "image" },
  { name: "File from disk", file: "floor-plan.png · 1.2 MB", kind: "file" },
  { name: "Last task report", file: "auth-refactor-report.md", kind: "doc" },
] as const;

const POPOVER: React.CSSProperties = {
  position: "absolute",
  bottom: "38px",
  borderRadius: "14px",
  background: "#131317",
  border: "1px solid #2C2C32",
  boxShadow: "0 24px 52px rgba(0,0,0,.65)",
  zIndex: 40,
  animation: "riseIn .3s cubic-bezier(.2,.9,.3,1.05) both",
};

const CAPS: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: "9.5px",
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "#ABA8A1",
};

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "9px",
};

const ICON = {
  width: 14,
  height: 14,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.4",
};

const CTX_MAX = 200_000;
export const contextOf = (messages: number): number => 1300 + messages * 40;
export const contextPct = (context: number): string =>
  `${String(Math.max(1, Math.round((context / CTX_MAX) * 100)))}%`;

/** What can be hung on a message: a snapshot, a file, or the last report. */
export function AttachMenu(): React.JSX.Element {
  const set = useDesign((s) => s.set);
  const flash = useDesign((s) => s.flash);
  return (
    <div style={{ ...POPOVER, left: "0", width: "268px", padding: "6px" }}>
      <div style={{ ...CAPS, padding: "7px 9px 8px" }}>attach</div>
      {ATTACH_OPTIONS.map((option) => (
        <button
          type="button"
          key={option.file}
          onClick={() => {
            const file = option.file.split(" · ")[0] ?? option.file;
            set({ attachment: file, attachOpen: false });
            flash(`${file} attached`);
          }}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "11px",
            padding: "9px",
            borderRadius: "10px",
            border: "1px solid transparent",
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
            transition: "all .2s cubic-bezier(.2,.8,.3,1)",
          }}
          className="hopd"
        >
          <span
            style={{
              width: "28px",
              height: "28px",
              flex: "0 0 28px",
              borderRadius: "9px",
              display: "grid",
              placeItems: "center",
              background: "#202026",
              color: "#FFD666",
            }}
          >
            {option.kind === "image" ? (
              <svg {...ICON}>
                <rect x="2" y="3" width="12" height="10" rx="2" />
                <circle cx="6" cy="6.6" r="1.2" />
                <polyline points="3,12 6.6,8.6 9,11 11.4,9 13,10.6" strokeLinecap="round" />
              </svg>
            ) : option.kind === "file" ? (
              <svg {...ICON}>
                <path d="M4 2h5l3 3v9H4z" />
                <polyline points="9,2 9,5 12,5" />
              </svg>
            ) : (
              <svg {...ICON} strokeLinecap="round">
                <line x1="3.5" y1="4.5" x2="12.5" y2="4.5" />
                <line x1="3.5" y1="8" x2="12.5" y2="8" />
                <line x1="3.5" y1="11.5" x2="9" y2="11.5" />
              </svg>
            )}
          </span>
          <span style={{ flex: "1", minWidth: "0" }}>
            <span style={{ display: "block", fontSize: "12.5px", color: "#F2EFE8" }}>
              {option.name}
            </span>
            <span
              style={{
                display: "block",
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "10px",
                color: "#A6A39C",
                marginTop: "3px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {option.file}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Three meters and a count: what this conversation costs, without leaving it. */
export function UsageMenu({ context }: { context: number }): React.JSX.Element {
  const counts = useDesign((s) => s.counts);
  const set = useDesign((s) => s.set);
  const today = counts.in + counts.out;
  const meters = [
    {
      name: "Context window",
      value: `${fmt(context)} / 200 k`,
      pct: contextPct(context),
      bar: "linear-gradient(90deg,#E0A400,var(--a,#FFC531))",
      fg: "#FFD666",
    },
    {
      name: "Tokens today",
      value: `${fmt(today)} / 50 k`,
      pct: `${String(Math.min(100, Math.round((today / 50_000) * 100) + 3))}%`,
      bar: "linear-gradient(90deg,#8C7A2E,#D9C06A)",
      fg: "#E4E1DB",
    },
    {
      name: "Subscription window",
      value: "18 % of 5 h limit",
      pct: "18%",
      bar: "linear-gradient(90deg,#2E7A5C,#5BD9A0)",
      fg: "#8FE8C4",
    },
  ];
  return (
    <div style={{ ...POPOVER, right: "0", width: "284px", padding: "14px" }}>
      <div style={{ ...CAPS, marginBottom: "12px" }}>ai usage &amp; limits</div>
      {meters.map((meter) => (
        <div key={meter.name} style={{ marginBottom: "13px" }}>
          <div style={{ ...ROW, marginBottom: "7px" }}>
            <span style={{ fontSize: "12px", color: "#E9E7E2" }}>{meter.name}</span>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "10.5px",
                color: meter.fg,
              }}
            >
              {meter.value}
            </span>
          </div>
          <div
            style={{
              height: "4px",
              borderRadius: "99px",
              background: "#1F1F24",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: "99px",
                transition: "width .5s cubic-bezier(.2,.9,.3,1)",
                background: meter.bar,
                width: meter.pct,
              }}
            />
          </div>
        </div>
      ))}
      <div style={{ height: "1px", background: "#26262C", margin: "4px 0 11px" }} />
      <div style={{ ...ROW, marginBottom: "12px" }}>
        <span style={{ fontSize: "11.5px", color: "#A6A39C" }}>Rate limits hit today</span>
        <span
          style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#8FE8C4" }}
        >
          0
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          set({ usageOpen: false, tab: "Usage" });
        }}
        style={{
          width: "100%",
          padding: "9px",
          borderRadius: "10px",
          border: "1px solid rgba(255,197,49,.35)",
          background: "rgba(255,197,49,.09)",
          color: "#FFD666",
          fontSize: "12px",
          fontWeight: "500",
          cursor: "pointer",
          transition: "all .2s",
        }}
        className="hope"
      >
        Open full usage
      </button>
    </div>
  );
}
