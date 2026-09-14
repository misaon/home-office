import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Card, Floor } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { PRIMARY, SheetShell } from "./sheet-shell.tsx";
import { MONO, priority } from "./tokens.ts";
import { useDesign } from "./store.ts";

const TAG: React.CSSProperties = {
  ...MONO,
  fontSize: "9.5px",
  padding: "4px 9px",
  borderRadius: "6px",
};

/** One task, opened up: what it is, who has it, and the two ways it can leave this state. */
export function TaskSheet({ task, floor }: { task: Card; floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const flash = useDesign((s) => s.flash);
  const { pBg, pFg } = priority(task.p);

  const move = useMutation({
    mutationFn: (status: "done" | "in_progress") =>
      requireClient().tasks.transition({ id: task.id, to: status }),
    onSuccess: () => {
      set({ sheet: null });
    },
    onError: (error: Error) => {
      flash(error.message);
    },
  });

  return (
    <SheetShell
      title={task.t}
      titleStyle={{ fontSize: "14px", lineHeight: "1.4", textWrap: "pretty" }}
    >
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span style={{ ...TAG, background: pBg, color: pFg }}>{t(`priority.${task.p}`)}</span>
        <span style={{ ...TAG, background: "#24242A", color: "#BEBBB4" }}>
          {t(`taskKind.${task.k}`)}
        </span>
        <span style={{ ...TAG, background: "#24242A", color: "#BEBBB4" }}>
          {t(`status.${task.status}`)}
        </span>
      </div>
      <div
        style={{
          padding: "12px",
          borderRadius: "12px",
          background: "#111114",
          border: "1px solid #26262C",
          marginBottom: "18px",
        }}
      >
        <div style={{ ...MONO, fontSize: "10px", color: "#A6A39C" }}>{floor.name}</div>
        <div style={{ fontSize: "12.5px", color: "#E4E1DB", lineHeight: "1.5", marginTop: "6px" }}>
          {task.who === "" ? t("board.unassigned") : t("board.assignedTo", { name: task.who })}
        </div>
      </div>
      <div style={{ display: "flex", gap: "9px" }}>
        <button
          type="button"
          disabled={move.isPending}
          onClick={() => {
            move.mutate("done");
          }}
          style={PRIMARY}
          className="hopm"
        >
          {t("board.moveToDone")}
        </button>
        <button
          type="button"
          disabled={move.isPending}
          onClick={() => {
            move.mutate("in_progress");
          }}
          style={{
            padding: "11px 15px",
            borderRadius: "11px",
            border: "1px solid #2C2C32",
            background: "transparent",
            color: "#CFCCC6",
            fontSize: "12.5px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all .2s",
          }}
          className="hop8"
        >
          {t("board.handBack")}
        </button>
      </div>
    </SheetShell>
  );
}
