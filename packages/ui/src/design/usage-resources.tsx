import { MONO, separator } from "./tokens.ts";
import { useFloor } from "./store.ts";

const LANE: React.CSSProperties = {
  flex: "1",
  height: "4px",
  borderRadius: "99px",
  background: "#1F1F24",
  overflow: "hidden",
  minWidth: "40px",
};

const LABEL: React.CSSProperties = { ...MONO, fontSize: "10px", color: "#A6A39C", width: "30px" };
const READING: React.CSSProperties = {
  ...MONO,
  fontSize: "10px",
  color: "#CFCCC6",
  width: "36px",
  textAlign: "right",
};

/** One sandbox's two meters. */
function Meter({
  name,
  value,
  fill,
  delay,
  spaced = false,
}: {
  name: string;
  value: string;
  fill: string;
  delay: string;
  spaced?: boolean;
}): React.JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        ...(spaced ? { marginBottom: "7px" } : {}),
      }}
    >
      <span style={LABEL}>{name}</span>
      <span style={LANE}>
        <span
          style={{
            display: "block",
            height: "100%",
            background: fill,
            transformOrigin: "left",
            animation: `growX ${delay} cubic-bezier(.2,.9,.3,1) both`,
            width: value,
          }}
        />
      </span>
      <span style={READING}>{value}</span>
    </div>
  );
}

/** What the floor is running on: one box per agent, and the engine underneath them. */
export function UsageResources(): React.JSX.Element {
  const floor = useFloor();
  const boxes = floor.team.map((p) => ({
    name: `${p.name.toLowerCase()}-${floor.name}`,
    dot: p.status === "working" ? "#5BD9A0" : "#3A3A41",
    up: p.status === "working" ? "up 41m" : "idle 12m",
    cpu: p.status === "working" ? "34%" : "4%",
    mem: p.status === "working" ? "58%" : "21%",
  }));

  return (
    <div style={{ animation: "fadeUp .35s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 2px 9px" }}>
        <span
          style={{
            ...MONO,
            fontSize: "10px",
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "#ABA8A1",
          }}
        >
          sandboxes
        </span>
        <span style={{ flex: "1", height: "1px", background: "#1F1F24" }} />
        <span style={{ ...MONO, fontSize: "10.5px", color: "#A6A39C" }}>{floor.team.length}</span>
      </div>
      <div
        style={{
          borderRadius: "14px",
          background: "#101013",
          border: "1px solid #232328",
          overflow: "hidden",
          marginBottom: "18px",
        }}
      >
        {boxes.map((box, i) => (
          <div
            key={box.name}
            style={{
              display: "flex",
              alignItems: "stretch",
              borderTop: `1px solid ${separator(i === 0)}`,
            }}
          >
            <div style={{ width: "3px", flex: "0 0 3px", background: box.dot }} />
            <div style={{ flex: "1", minWidth: "0", padding: "12px 13px" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}
              >
                <span
                  style={{
                    ...MONO,
                    fontSize: "12px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {box.name}
                </span>
                <div style={{ flex: "1" }} />
                <span style={{ ...MONO, fontSize: "10px", color: "#A6A39C", flex: "0 0 auto" }}>
                  {box.up}
                </span>
              </div>
              <Meter
                name="cpu"
                value={box.cpu}
                fill="linear-gradient(90deg,#E0A400,#FFC531)"
                delay=".9s"
                spaced
              />
              <Meter
                name="mem"
                value={box.mem}
                fill="linear-gradient(90deg,#8C7A2E,#D9C06A)"
                delay="1.1s"
              />
            </div>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "11px",
            padding: "13px",
            borderTop: "1px solid #1E1E23",
            background: "#0D0D10",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#5BD9A0",
              boxShadow: "0 0 10px rgba(91,217,160,.7)",
              flex: "0 0 auto",
            }}
          />
          <div style={{ flex: "1", minWidth: "0" }}>
            <div style={{ fontSize: "13px" }}>Docker engine</div>
            <div style={{ ...MONO, fontSize: "10.5px", color: "#A6A39C", marginTop: "3px" }}>
              running · 4 images · 12.4 GB
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
