import { isSessionActive, type LiveEvent, type ProjectId } from "@ho/protocol";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { usageQuery } from "../queries.ts";
import { useUi } from "../store.ts";
import { fmt, useDesign } from "./store.ts";

const POPOVER: React.CSSProperties = {
  position: "absolute",
  bottom: "38px",
  right: "0",
  width: "284px",
  padding: "14px",
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

/** The last thing a running session said about how full its context window is. */
const contextOf = (events: readonly LiveEvent[] | undefined): number | null => {
  const last = events?.findLast((l) => l.event.kind === "context");
  return last === undefined || last.event.kind !== "context" || last.event.windowTokens === 0
    ? null
    : last.event.usedTokens / last.event.windowTokens;
};

/** How full the fullest running context window on this floor is, or null when nothing is running. */
export function useContextFill(floorId: ProjectId): number | null {
  const sessions = useUi((s) => s.snapshot.sessions);
  const tasks = useUi((s) => s.snapshot.tasks);
  const live = useUi((s) => s.live);
  const fills = [...sessions.values()]
    .filter((s) => isSessionActive(s.state) && tasks.get(s.taskId)?.projectId === floorId)
    .map((s) => contextOf(live.get(s.id)))
    .filter((fill): fill is number => fill !== null);
  return fills.length === 0 ? null : Math.max(...fills);
}

function Meter({
  name,
  value,
  pct,
  bar,
  fg,
}: {
  name: string;
  value: string;
  pct: string;
  bar: string;
  fg: string;
}): React.JSX.Element {
  return (
    <div style={{ marginBottom: "13px" }}>
      <div style={{ ...ROW, marginBottom: "7px" }}>
        <span style={{ fontSize: "12px", color: "#E9E7E2" }}>{name}</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10.5px", color: fg }}>
          {value}
        </span>
      </div>
      <div
        style={{ height: "4px", borderRadius: "99px", background: "#1F1F24", overflow: "hidden" }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: "99px",
            transition: "width .5s cubic-bezier(.2,.9,.3,1)",
            background: bar,
            width: pct,
          }}
        />
      </div>
    </div>
  );
}

/**
 * What this floor is spending. The office reports what its own sessions told it and nothing more: no
 * provider hands out a plan's quota, so there is no percentage of one here.
 */
export function UsageMenu({ floorId }: { floorId: ProjectId }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const fill = useContextFill(floorId);
  const query = useQuery({ ...usageQuery(24), refetchInterval: 15_000 });
  const totals = query.data?.totals;
  const spent = totals === undefined ? 0 : totals.inputTokens + totals.outputTokens;

  return (
    <div style={POPOVER}>
      <div style={{ ...CAPS, marginBottom: "12px" }}>{t("usage.chipTitle")}</div>
      {fill === null ? (
        <div style={{ fontSize: "11.5px", color: "#A6A39C", marginBottom: "13px" }}>
          {t("usage.noRunning")}
        </div>
      ) : (
        <Meter
          name={t("usage.contextLabel")}
          value={t("usage.context", { percent: Math.round(fill * 100) })}
          pct={`${String(Math.max(1, Math.round(fill * 100)))}%`}
          bar={
            fill > 0.9
              ? "linear-gradient(90deg,#B3453F,#F28B8B)"
              : fill > 0.7
                ? "linear-gradient(90deg,#9A6620,#F2994A)"
                : "linear-gradient(90deg,#E0A400,var(--a,#FFC531))"
          }
          fg={fill > 0.9 ? "#FFB3B3" : fill > 0.7 ? "#F2994A" : "#FFD666"}
        />
      )}
      <div style={{ ...ROW, marginBottom: "12px" }}>
        <span style={{ fontSize: "11.5px", color: "#A6A39C" }}>{t("usage.day")}</span>
        <span
          style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#E4E1DB" }}
        >
          {fmt(spent)}
        </span>
      </div>
      <div style={{ ...ROW, marginBottom: "12px" }}>
        <span style={{ fontSize: "11.5px", color: "#A6A39C" }}>{t("usage.rateLimited")}</span>
        <span
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: "11px",
            color: (query.data?.rateLimitIncidents ?? 0) > 0 ? "#F2994A" : "#8FE8C4",
          }}
        >
          {query.data?.rateLimitIncidents ?? 0}
        </span>
      </div>
      <p style={{ fontSize: "11px", color: "#A6A39C", lineHeight: "1.6", margin: "0 0 12px" }}>
        {t("usage.chipNote")}
      </p>
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
        className="ho-ef3632"
      >
        {t("usage.openFull")}
      </button>
    </div>
  );
}
