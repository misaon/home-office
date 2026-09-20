import { canTransition, isTerminal } from "@ho/core";
import { REVIEW_STAGES, type ReviewStage } from "@ho/protocol";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FIELD } from "./controls.tsx";
import type { Card, Floor } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { PRIMARY, SheetShell } from "./sheet-shell.tsx";
import { MONO, priority } from "./tokens.ts";
import { useDesign, useOfficeMutation } from "./store.ts";

const TAG = `${MONO} text-9h py-4 px-9 rounded-6`;
const PANEL = "p-12 rounded-12 bg-card-lit border border-border";
const CAPTION = `${MONO} text-10 tracking-caps uppercase text-ink-label mb-7`;
const SECONDARY =
  "hover:text-accent-soft hover:border-accent-a45 py-11 px-15 rounded-11 border border-border-strong bg-transparent text-ink-quiet text-12h cursor-pointer whitespace-nowrap transition-all duration-200";
const RATE = `${SECONDARY} inline-flex items-center gap-6 disabled:opacity-50`;
const COMMIT_CHARS = 12;

type Verdict = "good" | "bad";

function Rating({ task }: { task: Card }): React.JSX.Element {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const rate = useOfficeMutation({
    mutationFn: (verdict: Verdict) =>
      requireClient().tasks.rate({ id: task.id, verdict, note: note.trim() }),
    onSuccess: () => {
      setNote("");
    },
  });
  return (
    <div className={`${PANEL} mt-18`}>
      <div className={CAPTION}>{t("board.rateTitle")}</div>
      {task.rating === null ? null : (
        <div className="text-12h text-ink-dim leading-body mb-8">
          {t(task.rating === "good" ? "board.ratedGood" : "board.ratedBad")}
        </div>
      )}
      <input
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
        }}
        placeholder={t("board.rateNote")}
        aria-label={t("board.rateNote")}
        className={`${FIELD} placeholder:text-ink-ghost mb-9`}
      />
      <div className="flex gap-9">
        <button
          type="button"
          disabled={rate.isPending}
          onClick={() => {
            rate.mutate("good");
          }}
          className={`${RATE}${task.rating === "good" ? " text-accent-soft border-accent-a45" : ""}`}
        >
          <ThumbsUp size={13} aria-hidden="true" />
          {t("board.rateGood")}
        </button>
        <button
          type="button"
          disabled={rate.isPending}
          onClick={() => {
            rate.mutate("bad");
          }}
          className={`${RATE}${task.rating === "bad" ? " text-accent-soft border-accent-a45" : ""}`}
        >
          <ThumbsDown size={13} aria-hidden="true" />
          {t("board.rateBad")}
        </button>
      </div>
    </div>
  );
}

function ReviewPlanPanel({ task }: { task: Card }): React.JSX.Element {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const waive = useOfficeMutation({
    mutationFn: (stage: ReviewStage) => requireClient().tasks.waiveReview({ id: task.id, stage }),
    onSuccess: (_task, stage) => {
      flash(t("board.waived", { role: t(`roles.${stage}`) }));
    },
  });
  const asked = REVIEW_STAGES.filter((stage) => task.reviews[stage]);
  return (
    <div className={`${PANEL} mb-18`}>
      <div className={CAPTION}>{t("board.reviewPlan")}</div>
      <div className="flex gap-6 flex-wrap">
        {asked.length === 0 ? (
          <span className="text-12h text-ink-dim">{t("board.reviewOff")}</span>
        ) : (
          asked.map((stage) => (
            <span
              key={stage}
              className={`${TAG} ${task.missingReviews.includes(stage) ? "bg-bad-a12 text-bad" : "bg-edge-lit text-ink-faint"}`}
            >
              {t(`roles.${stage}`)}
            </span>
          ))
        )}
      </div>
      {task.missingReviews.map((stage) => (
        <div key={stage} className="mt-9">
          <div className="text-12h text-ink-dim leading-body mb-7">
            {t("board.reviewMissing", { role: t(`roles.${stage}`) })}
          </div>
          <button
            type="button"
            disabled={waive.isPending}
            onClick={() => {
              waive.mutate(stage);
            }}
            className={SECONDARY}
          >
            {t("board.waive", { role: t(`roles.${stage}`) })}
          </button>
        </div>
      ))}
    </div>
  );
}

function Provenance({ task }: { task: Card }): React.JSX.Element | null {
  const { t } = useTranslation();
  if (task.kind !== "code") {
    return null;
  }
  return (
    <div className={`${PANEL} mb-18`}>
      <div className={CAPTION}>{t("board.commit")}</div>
      <div className={`${MONO} text-11 text-ink-dim`}>
        {task.commit === null ? t("board.commitNone") : task.commit.slice(0, COMMIT_CHARS)}
      </div>
      {task.buildsOn.length === 0 ? null : (
        <>
          <div className={`${CAPTION} mt-10`}>{t("board.buildsOn")}</div>
          <ul className="list-none m-0 p-0">
            {task.buildsOn.map((title) => (
              <li key={title} className="text-12h text-ink-dim leading-body mt-4">
                {title}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function TaskSheet({ task, floor }: { task: Card; floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const tone = priority(task.priority);
  const canFinish = canTransition(task.status, "done");
  const canResume = task.who !== "" && canTransition(task.status, "assigned");
  const rateable = task.status !== "inbox" && task.status !== "planned";

  const move = useOfficeMutation({
    mutationFn: (status: "done" | "assigned") =>
      requireClient().tasks.transition({ id: task.id, to: status }),
    onSuccess: () => {
      set({ sheet: null });
    },
  });

  return (
    <SheetShell title={task.title} titleClass="text-14 leading-card text-pretty">
      <div className="flex gap-6 mb-16 flex-wrap">
        <span className={`${TAG} ${tone}`}>{t(`priority.${task.priority}`)}</span>
        <span className={`${TAG} bg-edge-lit text-ink-faint`}>{t(`taskKind.${task.kind}`)}</span>
        <span className={`${TAG} bg-edge-lit text-ink-faint`}>{t(`status.${task.status}`)}</span>
      </div>
      <div className={`${PANEL} mb-18`}>
        <div className={`${MONO} text-10 text-ink-meta`}>{floor.name}</div>
        <div className="text-12h text-ink-dim leading-body mt-6">
          {task.who === "" ? t("board.unassigned") : t("board.assignedTo", { name: task.who })}
        </div>
      </div>
      {task.criteria.length === 0 ? null : (
        <div className={`${PANEL} mb-18`}>
          <div className={CAPTION}>{t("board.criteria")}</div>
          <ol className="list-none m-0 p-0">
            {task.criteria.map((criterion, index) => (
              <li key={criterion} className="text-12h text-ink-dim leading-body flex gap-8 mt-6">
                <span className={`${MONO} text-10 text-ink-meta flex-[0_0_auto]`}>
                  {index + 1}.
                </span>
                <span>{criterion}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <Provenance task={task} />
      {task.kind === "code" ? <ReviewPlanPanel task={task} /> : null}
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
                move.mutate("assigned");
              }}
              className={SECONDARY}
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
      {rateable ? <Rating task={task} /> : null}
    </SheetShell>
  );
}
