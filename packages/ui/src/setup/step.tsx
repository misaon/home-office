import { useTranslation } from "react-i18next";
import { Badge } from "../kit/controls.tsx";
import type { StepState } from "./status.ts";

export type StepStatus = { state: StepState; text: string };

const BADGE = {
  ok: { label: "setup.done", tone: "good" },
  todo: { label: "setup.todo", tone: "warn" },
  error: { label: "setup.problem", tone: "bad" },
  unknown: { label: null, tone: "neutral" },
} as const satisfies Record<
  StepState,
  { label: string | null; tone: "good" | "warn" | "bad" | "neutral" }
>;

type Props = {
  index: number;
  title: string;
  status: StepStatus;
  children?: React.ReactNode;
};

/** One row of the setup checklist: number, title, state badge and the step's own controls. */
export function SetupStep({ index, title, status, children }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const badge = BADGE[status.state];
  return (
    <section className="animate-rise p-4" style={{ animationDelay: `${String(index * 60)}ms` }}>
      <div className="flex items-center gap-3">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs ${
            status.state === "ok" ? "bg-good/15 text-good" : "bg-background text-foreground/80"
          }`}
        >
          {status.state === "ok" ? "✓" : index}
        </span>
        <h3 className="flex-1 text-sm font-medium">{title}</h3>
        <Badge tone={badge.tone}>{badge.label === null ? "…" : t(badge.label)}</Badge>
      </div>
      <p className="mt-2 pl-9 text-xs leading-relaxed text-foreground/80">{status.text}</p>
      {children === undefined ? null : <div className="mt-3 pl-9 text-xs">{children}</div>}
    </section>
  );
}
