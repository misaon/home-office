import type { SessionMode } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { diffOf } from "./diff.ts";
import type { Activity, FileChange, Step } from "./live.ts";
import { RichText } from "./markdown.tsx";
import { useDesign } from "./store.ts";
import { MONO } from "./tokens.ts";

const CARD =
  "flex flex-col gap-6 py-10 px-12 rounded-14 rounded-bl-5 bg-toast border border-border w-full max-w-[92%] mr-auto animate-lift-300";

const HEAD = `${MONO} text-10 tracking-mono text-ink-label flex items-center gap-7`;

const META = `${MONO} text-9h tracking-mono text-ink-meta flex items-center gap-5 min-w-0 pl-2`;

const DOT = "w-5 h-5 rounded-half bg-accent";

const ROW = "flex items-center gap-7 min-w-0";

const STEPS = "flex flex-col-reverse gap-6 max-h-150 overflow-y-auto";

const TOOL = `${MONO} text-10h text-accent-quote flex-[0_0_auto]`;

const DETAIL = `${MONO} text-10h text-ink-label flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap`;

const TEXT = "text-12h leading-text text-ink-soft border-t border-line pt-7 mt-1";

const CLIP = "overflow-hidden text-ellipsis whitespace-nowrap";

const CHANGE =
  "flex items-center gap-7 min-w-0 w-full py-4 px-7 -mx-7 rounded-7 border-0 bg-transparent text-left cursor-pointer transition-colors duration-200";

const DOING = {
  work: "chat.doingWork",
  review: "chat.doingReview",
  triage: "chat.doingTriage",
  plan: "chat.doingPlan",
} as const satisfies Record<SessionMode, string>;

const DONE = {
  work: "chat.doneWork",
  review: "chat.doneReview",
  triage: "chat.doneTriage",
  plan: "chat.donePlan",
} as const satisfies Record<SessionMode, string>;

function Mark({ ok }: { ok: boolean | null }): React.JSX.Element {
  if (ok === null) {
    return <span className="flex-[0_0_auto] w-9 text-10h text-accent-soft">⟳</span>;
  }
  return (
    <span className={`flex-[0_0_auto] w-9 text-10h ${ok ? "text-good-soft" : "text-bad-soft"}`}>
      {ok ? "✓" : "✕"}
    </span>
  );
}

const splitPath = (path: string): { directory: string; base: string } => {
  const cut = path.lastIndexOf("/");
  return cut === -1
    ? { directory: "", base: path }
    : { directory: path.slice(0, cut + 1), base: path.slice(cut + 1) };
};

const WORK_PREFIX = /^\/work\/repo\//u;

function ChangeRow({ change }: { change: FileChange }): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const { added, removed } = diffOf(change);
  const { directory, base } = splitPath(change.path.replace(WORK_PREFIX, ""));
  return (
    <button
      type="button"
      title={t("diff.title")}
      onClick={() => {
        set({ diff: change });
      }}
      className={`hover:bg-accent-a08 ${CHANGE}`}
    >
      <span className="flex-[0_0_auto] w-9 text-10h text-accent-soft">✎</span>
      <span className={`${MONO} text-10h min-w-0 flex-1 ${CLIP}`}>
        <span className="text-ink-label">{directory}</span>
        <span className="text-ink-soft">{base}</span>
      </span>
      {change.before === null ? (
        <span className={`${MONO} text-9h text-accent-quote flex-[0_0_auto]`}>
          {t("diff.newFile")}
        </span>
      ) : null}
      <span
        className={`${MONO} text-10h text-good-soft flex-[0_0_auto]`}
      >{`+${String(added)}`}</span>
      <span
        className={`${MONO} text-10h text-bad-soft flex-[0_0_auto]`}
      >{`−${String(removed)}`}</span>
    </button>
  );
}

function StepRow({ step }: { step: Step }): React.JSX.Element {
  if (step.change !== null) {
    return <ChangeRow change={step.change} />;
  }
  return (
    <div className={ROW}>
      <Mark ok={step.ok} />
      <span className={TOOL}>{step.tool}</span>
      <span className={DETAIL}>{step.detail}</span>
    </div>
  );
}

function Header({ activity }: { activity: Activity }): React.JSX.Element {
  const { t } = useTranslation();
  const changed = activity.steps.filter((step) => step.change !== null).length;
  return (
    <div className={HEAD}>
      {activity.live ? (
        ["0s", ".15s", ".3s"].map((delay) => (
          <span key={delay} className={`${DOT} animate-dots wait`} style={{ "--wait": delay }} />
        ))
      ) : (
        <span className="text-10h text-good-soft">✓</span>
      )}
      <span className={`ml-3 flex-1 min-w-0 ${CLIP}`}>
        {activity.live
          ? `${activity.name} ${t(DOING[activity.mode])}…`
          : `${activity.name} ${t(DONE[activity.mode])} · ${t("chat.changedFiles", { count: changed })}`}
      </span>
      <span className={`${MONO} text-10h text-accent-soft flex-[0_0_auto]`}>{activity.since}</span>
    </div>
  );
}

export function ChatTranscript({ activity }: { activity: Activity }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={CARD}>
      <Header activity={activity} />
      <div className={META}>
        <span className={`${CLIP} flex-[0_0_auto]`}>{t(`roles.${activity.role}`)}</span>
        <span aria-hidden="true">·</span>
        <span className={`${CLIP} min-w-0 text-accent-quote`}>{activity.model}</span>
        <span aria-hidden="true">·</span>
        <span className={`${CLIP} flex-[0_0_auto]`}>
          {t("chat.effort", { level: activity.effort })}
        </span>
      </div>
      <div className={STEPS}>
        {activity.steps.toReversed().map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </div>
      {activity.text === "" ? null : (
        <div className={TEXT}>
          <RichText text={activity.text} />
        </div>
      )}
    </div>
  );
}
