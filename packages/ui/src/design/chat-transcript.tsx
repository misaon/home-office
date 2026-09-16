import { useTranslation } from "react-i18next";
import type { Activity, Step } from "./live.ts";
import { MONO } from "./tokens.ts";

const CARD =
  "flex flex-col gap-6 py-10 px-12 rounded-14 rounded-bl-5 bg-toast border border-border w-full max-w-[92%] mr-auto animate-lift-300";

const HEAD = `${MONO} text-10 tracking-mono text-ink-label flex items-center gap-7`;

const DOT = "w-5 h-5 rounded-half bg-accent";

const ROW = "flex items-center gap-7 min-w-0";

const STEPS = "flex flex-col-reverse gap-6 max-h-150 overflow-y-auto";

const TOOL = `${MONO} text-10h text-accent-quote flex-[0_0_auto]`;

const DETAIL = `${MONO} text-10h text-ink-label flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap`;

const TEXT = "text-12h leading-text text-ink-soft border-t border-line pt-7 mt-1";

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

function StepRow({ step }: { step: Step }): React.JSX.Element {
  return (
    <div className={ROW}>
      <Mark ok={step.ok} />
      <span className={TOOL}>{step.tool}</span>
      <span className={DETAIL}>{step.detail}</span>
    </div>
  );
}

export function ChatTranscript({ activity }: { activity: Activity }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={CARD}>
      <div className={HEAD}>
        {["0s", ".15s", ".3s"].map((delay) => (
          <span key={delay} className={`${DOT} animate-dots wait`} style={{ "--wait": delay }} />
        ))}
        <span className="ml-3 flex-1 min-w-0">{t("chat.thinking", { name: activity.name })}</span>
        <span className={`${MONO} text-10h text-accent-soft flex-[0_0_auto]`}>
          {activity.since}
        </span>
      </div>
      <div className={STEPS}>
        {activity.steps.toReversed().map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </div>
      {activity.text === "" ? null : <div className={TEXT}>{activity.text}</div>}
    </div>
  );
}
