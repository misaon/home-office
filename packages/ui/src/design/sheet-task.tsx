import { canTransition, isTerminal } from "@ho/core";
import { useTranslation } from "react-i18next";
import type { Card, Floor } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { PRIMARY, SheetShell } from "./sheet-shell.tsx";
import { MONO, priority } from "./tokens.ts";
import { useDesign, useOfficeMutation } from "./store.ts";

const TAG = `${MONO} text-9h py-4 px-9 rounded-6`;

/**
 * One task, opened up: what it is, who has it, and the ways it can actually leave this state. Only
 * two of the state machine's edges are drawn here, and a task is rarely standing on both: `done` is
 * reachable from `in_progress` and `review`, nothing else. Offering the other move anyway is how the
 * sheet used to answer a click with an error the office had already ruled out.
 */
export function TaskSheet({ task, floor }: { task: Card; floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const tone = priority(task.p);
  const canFinish = canTransition(task.status, "done");
  const canResume = canTransition(task.status, "in_progress");

  const move = useOfficeMutation({
    mutationFn: (status: "done" | "in_progress") =>
      requireClient().tasks.transition({ id: task.id, to: status }),
    onSuccess: () => {
      set({ sheet: null });
    },
  });

  return (
    <SheetShell title={task.t} titleClass="text-14 leading-card text-pretty">
      <div className="flex gap-6 mb-16 flex-wrap">
        <span className={`${TAG} ${tone}`}>{t(`priority.${task.p}`)}</span>
        <span className={`${TAG} bg-edge-lit text-ink-faint`}>{t(`taskKind.${task.k}`)}</span>
        <span className={`${TAG} bg-edge-lit text-ink-faint`}>{t(`status.${task.status}`)}</span>
      </div>
      <div className="p-12 rounded-12 bg-card-lit border border-border mb-18">
        <div className={`${MONO} text-10 text-ink-meta`}>{floor.name}</div>
        <div className="text-12h text-ink-dim leading-body mt-6">
          {task.who === "" ? t("board.unassigned") : t("board.assignedTo", { name: task.who })}
        </div>
      </div>
      {canFinish || canResume ? (
        <div className="flex gap-9">
          {canFinish ? (
            <button
              type="button"
              disabled={move.isPending}
              onClick={() => {
                move.mutate("done");
              }}
              className={`hover:-translate-y-2 hover:shadow-lift ${PRIMARY}`}
            >
              {t("board.moveToDone")}
            </button>
          ) : null}
          {canResume ? (
            <button
              type="button"
              disabled={move.isPending}
              onClick={() => {
                move.mutate("in_progress");
              }}
              className="hover:text-accent-soft hover:border-accent-a45 py-11 px-15 rounded-11 border border-border-strong bg-transparent text-ink-quiet text-12h cursor-pointer whitespace-nowrap transition-all duration-200"
            >
              {t("board.handBack")}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="text-12h text-ink-meta leading-body">
          {t(isTerminal(task.status) ? "board.taskClosed" : "board.taskNotStarted")}
        </div>
      )}
    </SheetShell>
  );
}
