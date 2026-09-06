import type { StepStatus } from "./status.ts";

const BADGE: Record<StepStatus["state"], { label: string; className: string }> = {
  ok: { label: "done", className: "bg-emerald-900/60 text-emerald-300" },
  todo: { label: "to do", className: "bg-amber-900/60 text-amber-200" },
  error: { label: "problem", className: "bg-red-900/60 text-red-200" },
  unknown: { label: "…", className: "bg-line text-gray-300" },
};

type Props = {
  index: number;
  title: string;
  status: StepStatus;
  children?: React.ReactNode;
};

/** One row of the setup checklist: number, title, state badge and the step's own controls. */
export function Step({ index, title, status, children }: Props): React.JSX.Element {
  const badge = BADGE[status.state];
  return (
    <section className="rounded border border-line bg-panel p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] text-gray-300">
          {index}
        </span>
        <h3 className="flex-1 font-medium">{title}</h3>
        <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <p className="mt-1 pl-7 text-[11px] text-gray-400">{status.text}</p>
      {children === undefined ? null : <div className="mt-2 pl-7 text-[11px]">{children}</div>}
    </section>
  );
}

export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
