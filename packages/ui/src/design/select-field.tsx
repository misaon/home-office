import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

/** The caption every field in a dialog is labelled with. */
const LABEL = `${MONO} text-9h tracking-caps-wider uppercase text-ink-label mb-8`;

const TRIGGER =
  "w-full flex items-center justify-between gap-8 py-12 px-13 rounded-12 bg-card cursor-pointer text-left transition-all duration-200";

const LIST =
  "absolute top-full left-0 right-0 mt-6 p-5 rounded-11 bg-menu border border-border-strong shadow-pop z-45 animate-rise-240";

const OPTION =
  "w-full flex items-center gap-8 py-8 px-9 rounded-8 border-0 cursor-pointer text-left transition-all duration-180";

const ELLIPSIS = "overflow-hidden text-ellipsis whitespace-nowrap";

/**
 * The design's own dropdown: a button that opens a list under itself. One open select at a time,
 * tracked by `scope:name`, which is how the mockup keeps two forms from opening together.
 */
export function SelectField({
  scope,
  name,
  label,
  options,
  value,
  mono = false,
  muted = false,
  onPick,
}: {
  scope: string;
  name: string;
  label: string;
  options: readonly string[];
  value: string;
  /** Branches and paths are written in the office's monospace, names and models are not. */
  mono?: boolean;
  /** A value that is a placeholder rather than a choice. */
  muted?: boolean;
  onPick: (next: string) => void;
}): React.JSX.Element {
  const openSelect = useDesign((s) => s.openSelect);
  const set = useDesign((s) => s.set);
  const update = useDesign((s) => s.update);
  const id = `${scope}:${name}`;
  const open = openSelect === id;

  return (
    <div className="relative">
      <div className={LABEL}>{label}</div>
      <button
        type="button"
        onClick={() => {
          update((s) => ({
            openSelect: s.openSelect === id ? null : id,
            attachOpen: false,
            usageOpen: false,
          }));
        }}
        className={`${TRIGGER} border hover:border-accent-a45 ${mono ? `${MONO} text-12` : "text-12h"} ${open ? "border-accent-a50" : "border-border-strong"}`}
      >
        <span className={`${ELLIPSIS} ${muted ? "text-ink-ghost" : ""}`}>{value}</span>
        <svg
          className={`flex-[0_0_auto] transition-transform duration-250 ${open ? "rotate-180" : "rotate-0"} stroke-ink-meta`}
          width="9"
          height="9"
          viewBox="0 0 12 12"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <polyline points="3,4.5 6,8 9,4.5" />
        </svg>
      </button>
      {open ? (
        <div className={LIST}>
          {options.map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => {
                onPick(option);
                set({ openSelect: null });
              }}
              className={`${OPTION} hover:bg-accent-a13 hover:text-accent-soft ${mono ? `${MONO} text-12` : "text-12h"} ${option === value ? "bg-accent-a12 text-accent-soft" : "bg-transparent text-ink-soft"}`}
            >
              <span
                className={`w-5 h-5 rounded-half flex-[0_0_auto] ${option === value ? "bg-accent" : "bg-dot-idle"}`}
              />
              <span className={ELLIPSIS}>{option}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
