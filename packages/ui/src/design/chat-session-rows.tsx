import type { TaskId } from "@ho/protocol";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { diffOf } from "./diff.ts";
import { RichText } from "./markdown.tsx";
import { useDesign } from "./store.ts";
import { ELLIPSIS, MONO } from "./tokens.ts";
import type { FileChange, Step } from "./transcript.ts";

const ROW = "flex items-center gap-7 min-w-0";

const TOOL = `${MONO} text-10h text-accent-quote flex-[0_0_auto]`;

const DETAIL = `${MONO} text-10h text-ink-label flex-1 min-w-0 ${ELLIPSIS}`;

const NOTE =
  "flex items-start gap-7 min-w-0 py-6 px-9 rounded-9 border text-11h leading-text text-ink-soft";

const STEER = `${NOTE} border-mode-plan/35 bg-mode-plan/10`;

const REMINDER = `${NOTE} border-accent-a30 bg-accent-a08`;

const CHANGE =
  "flex items-center gap-7 min-w-0 w-full py-4 px-7 -mx-7 rounded-7 border-0 bg-transparent text-left cursor-pointer transition-colors duration-200";

const LAST_WORDS =
  "relative text-11h leading-text text-ink-label border-t border-line pt-7 w-full text-left bg-transparent border-x-0 border-b-0 cursor-pointer";

const FADE =
  "pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,var(--color-panel))]";

const WORK_PREFIX = /^\/work\/repo\//u;

const splitPath = (path: string): { directory: string; base: string } => {
  const cut = path.lastIndexOf("/");
  return cut === -1
    ? { directory: "", base: path }
    : { directory: path.slice(0, cut + 1), base: path.slice(cut + 1) };
};

export const latestChanges = (steps: readonly Step[]): FileChange[] => {
  const byPath = new Map<string, FileChange>();
  for (const step of steps) {
    if (step.change !== null) {
      byPath.set(step.change.path, step.change);
    }
  }
  return [...byPath.values()];
};

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

export function ChangeRow({
  change,
  taskId,
}: {
  change: FileChange;
  taskId: TaskId;
}): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const { added, removed } = diffOf(change);
  const { directory, base } = splitPath(change.path.replace(WORK_PREFIX, ""));
  return (
    <button
      type="button"
      title={t("diff.title")}
      onClick={() => {
        set({ diff: { change, taskId } });
      }}
      className={`hover:bg-accent-a08 ${CHANGE}`}
    >
      <span className="flex-[0_0_auto] w-9 text-10h text-accent-soft">✎</span>
      <span className={`${MONO} text-10h min-w-0 flex-1 ${ELLIPSIS}`}>
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

export function StepRow({ step }: { step: Step }): React.JSX.Element {
  const { t } = useTranslation();
  if (step.kind !== "tool") {
    const steer = step.kind === "steer";
    return (
      <div className={steer ? STEER : REMINDER} title={t(steer ? "chat.steer" : "chat.reminder")}>
        <span className="flex-[0_0_auto]" aria-hidden="true">
          {steer ? "📨" : "⏱"}
        </span>
        <span className="min-w-0 flex-1">{step.detail}</span>
      </div>
    );
  }
  return (
    <div className={ROW}>
      <Mark ok={step.ok} />
      <span className={TOOL}>{step.tool}</span>
      <span className={DETAIL}>{step.detail}</span>
    </div>
  );
}

export function LastWords({ text }: { text: string }): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      title={t(open ? "chat.lessText" : "chat.moreText")}
      onClick={() => {
        setOpen((shown) => !shown);
      }}
      className={LAST_WORDS}
    >
      <div className={open ? "" : "max-h-58 overflow-hidden"}>
        <RichText text={text} />
      </div>
      {open ? null : <div className={FADE} />}
    </button>
  );
}
