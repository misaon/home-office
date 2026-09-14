import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { MONO } from "./tokens.ts";

const ROW: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px",
  borderRadius: "10px",
  cursor: "pointer",
  textAlign: "left",
  transition: "all .2s",
};

const BADGE: React.CSSProperties = {
  width: "22px",
  height: "22px",
  flex: "0 0 22px",
  borderRadius: "7px",
  display: "grid",
  placeItems: "center",
  ...MONO,
  fontSize: "10.5px",
};

const NAME: React.CSSProperties = {
  display: "block",
  ...MONO,
  fontSize: "12px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const PILL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "3px 8px 3px 7px",
  borderRadius: "99px",
  flex: "0 0 auto",
};

/** How busy a floor is, said in one pill: who is working, or what is stuck, or that it is quiet. */
function busyOf(floor: Floor): {
  busy: boolean;
  working: number;
  blocked: number;
  dot: string;
  bg: string;
  bd: string;
  fg: string;
} {
  const working = floor.team.filter((p) => p.status === "working").length;
  const running = floor.cards.filter((x) => x.s === "running").length;
  const blocked = floor.cards.filter((x) => x.s === "blocked").length;
  const busy = working > 0 || running > 0;
  return {
    busy,
    working: working > 0 ? working : running,
    blocked,
    dot: busy ? "var(--a,#FFC531)" : blocked > 0 ? "#FF9E9E" : "#6E6B66",
    bg: busy ? "rgba(255,197,49,.1)" : blocked > 0 ? "rgba(255,122,122,.1)" : "#1B1B20",
    bd: busy ? "rgba(255,197,49,.3)" : blocked > 0 ? "rgba(255,122,122,.28)" : "#2C2C32",
    fg: busy ? "#FFD666" : blocked > 0 ? "#FFB3B3" : "#A6A39C",
  };
}

/** One floor in the picker: its number, its name, what it is carrying, and how busy it is. */
export function FloorRow({
  floor,
  index,
  current,
  onPick,
}: {
  floor: Floor;
  index: number;
  current: boolean;
  onPick: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const busy = busyOf(floor);
  const open = floor.cards.filter((x) => x.s !== "done").length;

  return (
    <button
      type="button"
      aria-label={floor.name}
      onClick={onPick}
      style={{
        ...ROW,
        border: `1px solid ${current ? "rgba(255,197,49,.25)" : "transparent"}`,
        background: current ? "rgba(255,197,49,.08)" : "transparent",
      }}
      className="hop1"
    >
      <span
        style={{
          ...BADGE,
          background: current ? "var(--a,#FFC531)" : "#24242A",
          color: current ? "#150F02" : "#BEBBB4",
        }}
      >
        <span>{index + 1}</span>
      </span>
      <span style={{ flex: "1", minWidth: "0" }}>
        <span style={{ ...NAME, color: current ? "#FFD666" : "#E9E7E2" }}>{floor.name}</span>
        <span style={{ display: "block", fontSize: "10.5px", color: "#A6A39C", marginTop: "3px" }}>
          {t("project.summary", { agents: floor.team.length, open })}
        </span>
      </span>
      <span style={{ ...PILL, background: busy.bg, border: `1px solid ${busy.bd}` }}>
        <span
          style={{ position: "relative", width: "5px", height: "5px", display: "inline-block" }}
        >
          <span
            style={{ position: "absolute", inset: "0", borderRadius: "50%", background: busy.dot }}
          />
          {busy.busy ? (
            <span
              style={{
                position: "absolute",
                inset: "0",
                borderRadius: "50%",
                background: busy.dot,
                animation: "ring 2.2s ease-out infinite",
              }}
            />
          ) : null}
        </span>
        <span style={{ ...MONO, fontSize: "9.5px", whiteSpace: "nowrap", color: busy.fg }}>
          {busy.busy
            ? t("project.working", { count: busy.working })
            : busy.blocked > 0
              ? t("project.blocked", { count: busy.blocked })
              : t("project.quiet")}
        </span>
      </span>
    </button>
  );
}
