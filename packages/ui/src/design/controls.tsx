import { errorMessage } from "@ho/protocol";
import { MONO } from "./tokens.ts";

/**
 * The handful of controls the office's dialogs need, in the drawing's own language. The panels style
 * their buttons inline because each is drawn once; these exist because the setup checklist and the
 * add-project dialog repeat the same three shapes many times over.
 */

const BASE =
  "rounded-10 text-12h cursor-pointer whitespace-nowrap transition-all duration-220 py-9 px-15";

export type Tone = "primary" | "quiet" | "danger";

/** Each tone is how the button is painted at rest and under the pointer. */
const TONES: Record<Tone, string> = {
  primary:
    "border-0 bg-accent text-accent-ink font-semibold hover:-translate-y-2 hover:shadow-lift",
  quiet:
    "border border-border-strong bg-transparent text-ink-quiet hover:text-ink hover:border-border-hover hover:bg-raised",
  danger: "border border-bad-a30 bg-bad-a10 text-bad-soft hover:bg-bad-a20",
};

export function Button({
  tone = "quiet",
  children,
  ...rest
}: { tone?: Tone } & React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button type="button" {...rest} className={`${BASE} ${TONES[tone]}`}>
      {children}
    </button>
  );
}

export const FIELD = "w-full py-9 px-11 rounded-10 border border-border-strong bg-well text-12h";

/** The small upper-case caption every form field is labelled with. */
export function Caption({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className={`${MONO} text-10 tracking-caps uppercase text-ink-label mb-7`}>{children}</div>
  );
}

/** What went wrong, said where it went wrong, in the one colour the design keeps for it. */
export function Failure({ error }: { error: unknown }): React.JSX.Element | null {
  if (error === null || error === undefined) {
    return null;
  }
  return (
    <div className="mt-10 py-9 px-11 rounded-10 border border-bad-a30 bg-bad-a08 text-bad-soft text-11h leading-prose animate-rise-280">
      {errorMessage(error)}
    </div>
  );
}
