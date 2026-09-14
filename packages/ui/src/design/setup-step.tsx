import { useTranslation } from "react-i18next";
import type { StepState } from "../setup/status.ts";
import { DISPLAY, MONO } from "./tokens.ts";

export type StepStatus = { state: StepState; text: string };

const TONE: Record<
  StepState,
  { tone: string; label: "setup.done" | "setup.todo" | "setup.problem" | null }
> = {
  ok: { tone: "bg-good-a16 text-good-soft", label: "setup.done" },
  todo: { tone: "bg-chip text-ink-faint", label: "setup.todo" },
  error: { tone: "bg-bad-a15 text-bad-soft", label: "setup.problem" },
  unknown: { tone: "bg-chip text-ink-faint", label: null },
};

const NUMBER = `flex-[0_0_28px] w-28 h-28 rounded-9 grid place-items-center ${MONO} text-12`;

const TAG = `${MONO} text-9h py-3 px-9 rounded-pill`;

/**
 * What a step stacks under its description. The drawing gives a step one content-sized button, so the
 * stack does not stretch its children; anything that is a block in its own right says so with `WIDE`.
 */
export const STEP_BODY = "flex flex-col items-start gap-12";

/** A paragraph, a log or a field: as wide as the step, not as wide as its own text. */
export const WIDE = "self-stretch";

/** One row of the checklist: number, title, how it stands, and the step's own controls. */
export function SetupStep({
  index,
  title,
  status,
  children,
}: {
  index: number;
  title: string;
  status: StepStatus;
  children?: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const tone = TONE[status.state];
  const done = status.state === "ok";
  return (
    <div
      style={{
        "--wait": `${String(index * 60)}ms`,
      }}
      className="flex gap-15 py-20 px-0 border-b border-line animate-lift-400 wait"
    >
      <div className={`${NUMBER} ${tone.tone}`}>
        <span>{done ? "✓" : index}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-10 flex-wrap">
          <span className={`${DISPLAY} font-semibold text-14h`}>{title}</span>
          <span className={`${TAG} ${tone.tone}`}>{tone.label === null ? "…" : t(tone.label)}</span>
        </div>
        <div className="text-12h text-ink-label leading-read mt-8 text-pretty">{status.text}</div>
        {children === undefined ? null : <div className="mt-13">{children}</div>}
      </div>
    </div>
  );
}
