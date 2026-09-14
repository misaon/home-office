import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Floor } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { FloorSwitches } from "./settings-floor-switches.tsx";
import { useUi } from "../store.ts";
import { MONO, separator } from "./tokens.ts";
import { useDesign } from "./store.ts";

const CHEVRON = {
  width: 9,
  height: 9,
  viewBox: "0 0 12 12",
  fill: "none",
  stroke: "#A6A39C",
  strokeWidth: "1.5",
  strokeLinecap: "round",
} as const;

const HEAD: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "13px",
  border: "0",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  transition: "background .2s",
};

const BADGE: React.CSSProperties = {
  width: "20px",
  height: "20px",
  flex: "0 0 20px",
  borderRadius: "6px",
  display: "grid",
  placeItems: "center",
  ...MONO,
  fontSize: "10.5px",
};

const NAME: React.CSSProperties = {
  display: "block",
  ...MONO,
  fontSize: "12.5px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const PATH: React.CSSProperties = {
  ...MONO,
  fontSize: "10.5px",
  color: "#A6A39C",
  marginBottom: "14px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const REMOVE: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: "9px",
  border: "1px solid rgba(255,122,122,.3)",
  background: "rgba(255,122,122,.1)",
  color: "#FFB3B3",
  fontSize: "11.5px",
  cursor: "pointer",
  transition: "all .2s",
};

/** One floor in Settings: where it lives, how finished work leaves it, and what feeds it. */
export function SettingsFloor({
  floor,
  index,
  first,
}: {
  floor: Floor;
  index: number;
  first: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const current = useUi((s) => s.floorId) === floor.id;
  const floorRowOpen = useDesign((s) => s.floorRowOpen);
  const set = useDesign((s) => s.set);
  const flash = useDesign((s) => s.flash);
  const confirm = useDesign((s) => s.confirm);
  const open = floorRowOpen === floor.id;
  const openTasks = floor.cards.filter((x) => x.s !== "done").length;

  const remove = useMutation({
    mutationFn: () => requireClient().projects.remove({ id: floor.id }),
    onSuccess: () => {
      flash(t("project.removed", { name: floor.name }));
    },
    onError: (error: Error) => {
      flash(error.message);
    },
  });

  return (
    <div
      style={{ display: "flex", alignItems: "stretch", borderTop: `1px solid ${separator(first)}` }}
    >
      <div
        style={{
          width: "3px",
          flex: "0 0 3px",
          background: current ? "var(--a,#FFC531)" : "#2C2C32",
        }}
      />
      <div style={{ flex: "1", minWidth: "0" }}>
        <button
          type="button"
          onClick={() => {
            set({ floorRowOpen: open ? null : floor.id });
          }}
          style={HEAD}
          className="ho-0b4177"
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
            <span style={NAME}>{floor.name}</span>
            <span
              style={{ display: "block", fontSize: "10.5px", color: "#A6A39C", marginTop: "4px" }}
            >
              {t("project.summaryTasks", { agents: floor.team.length, open: openTasks })}
            </span>
          </span>
          <svg
            style={{
              flex: "0 0 auto",
              transition: "transform .3s",
              transform: `rotate(${open ? "90deg" : "0deg"})`,
            }}
            {...CHEVRON}
          >
            <polyline points="4.5,3 8,6 4.5,9" />
          </svg>
        </button>
        {open ? (
          <div style={{ padding: "0 13px 14px", animation: "riseIn .28s ease both" }}>
            <div style={PATH}>{floor.path}</div>
            <FloorSwitches floor={floor} />
            <div style={{ height: "1px", background: "#1F1F24", margin: "14px 0" }} />
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                confirm({
                  title: t("project.removeTitle"),
                  body: t("project.confirmRemove", { name: floor.name }),
                  okLabel: t("settings.removeFloor"),
                  act: () => {
                    remove.mutate();
                  },
                });
              }}
              style={REMOVE}
              className="ho-52fd80"
            >
              {t("settings.removeFloor")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
