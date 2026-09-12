import { useTranslation } from "react-i18next";
import type { StepStatus } from "./status.ts";

const BADGE = {
  ok: { label: "setup.done", className: "bg-emerald-900/60 text-emerald-300" },
  todo: { label: "setup.todo", className: "bg-amber-900/60 text-amber-200" },
  error: { label: "setup.problem", className: "bg-red-900/60 text-red-200" },
  unknown: { label: null, className: "bg-line text-gray-300" },
} as const satisfies Record<StepStatus["state"], { label: string | null; className: string }>;

type Props = {
  index: number;
  title: string;
  status: StepStatus;
  children?: React.ReactNode;
};

/** One row of the setup checklist: number, title, state badge and the step's own controls. */
export function Step({ index, title, status, children }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const badge = BADGE[status.state];
  return (
    <section className="rounded-md border border-line bg-panel p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs text-gray-300">
          {index}
        </span>
        <h3 className="flex-1 font-medium">{title}</h3>
        <span className={`rounded px-2 py-0.5 text-2xs tracking-wide uppercase ${badge.className}`}>
          {badge.label === null ? "…" : t(badge.label)}
        </span>
      </div>
      <p className="mt-2 pl-9 text-xs leading-relaxed text-gray-400">{status.text}</p>
      {children === undefined ? null : <div className="mt-3 pl-9 text-xs">{children}</div>}
    </section>
  );
}
