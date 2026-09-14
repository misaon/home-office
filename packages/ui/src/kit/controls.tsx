import { errorMessage } from "@ho/protocol";
import { useId, useState } from "react";
import { Reveal } from "./reveal.tsx";

/** One rhythm for every text field, select and textarea in the office. */
export const CONTROL =
  "w-full rounded-lg border border-line bg-ink/60 px-3 py-2 text-sm text-text placeholder:text-faint hover:border-line-strong focus:border-accent/70 focus:outline-none";

/** The compact variant for a short input inside a card row. */
export const CONTROL_DENSE =
  "rounded-lg border border-line bg-ink/60 px-2 py-1 text-xs text-text hover:border-line-strong focus:border-accent/70 focus:outline-none";

/**
 * A surface one step above the panel it sits on: hairline border, a highlight along the top edge and a
 * soft shadow. `CARD_LIFT` is for a card that can be acted on, so the pointer gets an answer.
 */
export const CARD =
  "rounded-xl border border-line bg-raised shadow-card ring-1 ring-white/[0.03] ring-inset";
export const CARD_LIFT = `${CARD} transition-[transform,box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-soft)] hover:-translate-y-px hover:border-line-strong hover:shadow-lift`;

const VARIANTS = {
  primary:
    "bg-accent text-ink font-semibold hover:brightness-110 hover:shadow-glow active:scale-[0.98]",
  // A quiet button sits on cards made of the surface it used to borrow, so it takes the step above.
  quiet:
    "border border-line-strong bg-line/60 text-text hover:border-faint hover:bg-line active:scale-[0.98]",
  ghost: "text-muted hover:bg-line/40 hover:text-text active:scale-[0.98]",
  danger: "border border-bad/30 bg-bad/10 text-bad hover:bg-bad/20 active:scale-[0.98]",
} as const;

type Variant = keyof typeof VARIANTS;

export function Button({
  children,
  onClick,
  variant = "quiet",
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: Variant;
  disabled?: boolean;
  title?: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`rounded-lg px-3 py-1.5 text-xs disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]}`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A labelled control with room around it: the label, the control, then one line of help or error. */
export function Field({
  id,
  label,
  hint,
  tone = "muted",
  children,
}: {
  /** The control's own id, so the label belongs to it even when a button shares the row. */
  id: string;
  label: string;
  hint?: React.ReactNode;
  tone?: "muted" | "error";
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <label className="mb-1.5 block text-2xs font-medium tracking-wide text-muted" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint === undefined ? null : (
        <span className={`mt-1.5 block text-2xs ${tone === "error" ? "text-bad" : "text-faint"}`}>
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * One thing that is on or off, with its consequence written beside it. A bare checkbox in a settings
 * panel asks the reader to guess what it does; this says it, and the knob slides rather than blinking.
 */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
}): React.JSX.Element {
  const id = useId();
  return (
    <div className={`flex items-start gap-3 ${disabled ? "opacity-50" : ""}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full border px-0.5 ${
          checked ? "border-accent/60 bg-accent/80" : "border-line bg-ink hover:border-line-strong"
        }`}
        onClick={() => {
          onChange(!checked);
        }}
      >
        <span
          className={`h-3.5 w-3.5 rounded-full transition-transform duration-[var(--duration-base)] ease-[var(--ease-soft)] ${
            checked ? "translate-x-4 bg-ink" : "translate-x-0 bg-muted"
          }`}
        />
      </button>
      <span className="min-w-0">
        <span id={id} className="block text-xs text-text">
          {label}
        </span>
        {hint === undefined ? null : (
          <span className="mt-0.5 block text-2xs leading-relaxed text-faint">{hint}</span>
        )}
      </span>
    </div>
  );
}

/** Two or three exclusive choices side by side, for a switch that changes which fields apply. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}): React.JSX.Element {
  return (
    <div className="inline-flex gap-1 rounded-xl border border-line bg-ink/60 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            option.value === value
              ? "bg-raised text-text shadow-card"
              : "text-muted hover:text-text"
          }`}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A section of a panel: an uppercase heading and its rows, separated from what came before. */
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-2xs font-semibold tracking-widest text-faint uppercase">{title}</h3>
        <div className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
        {aside}
      </div>
      {children}
    </section>
  );
}

const TONES = {
  neutral: "border-line bg-ink/60 text-muted",
  good: "border-good/30 bg-good/10 text-good",
  warn: "border-warn/30 bg-warn/10 text-warn",
  bad: "border-bad/30 bg-bad/10 text-bad",
  accent: "border-accent/40 bg-accent/10 text-accent",
} as const;

/** A count or a state, said in one word. */
export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
  title?: string;
}): React.JSX.Element {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-md border px-1.5 py-px text-2xs ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** What a failed request said, or nothing while there is nothing to say. */
export function Failure({ error }: { error: unknown }): React.JSX.Element | null {
  const message = error === null || error === undefined ? null : errorMessage(error);
  // The words outlive the error itself, so the box has something to say while it collapses.
  const [shown, setShown] = useState(message);
  if (message !== null && message !== shown) {
    setShown(message);
  }
  return (
    <Reveal open={message !== null}>
      <p
        role="alert"
        className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad"
      >
        {shown}
      </p>
    </Reveal>
  );
}

/** Nothing here yet, said in a way that tells the reader what would put something here. */
export function Empty({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="animate-fade rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs leading-relaxed text-faint">
      {children}
    </p>
  );
}

export function FolderIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.9 12.4V3.6h4.2l1.5 1.8h6.5v7a1 1 0 0 1-1 1h-10.2a1 1 0 0 1-1-1Z" />
    </svg>
  );
}
