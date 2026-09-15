import { Tick } from "./icons.tsx";

/**
 * The card the office picks one of something with: a lit tile holding the mark, a name, a line of
 * explanation, and a tick in the corner once it is the chosen one. The dialog that hires a colleague
 * and the dialog that points a floor at a repository both ask the same question, so they ask it with
 * the same card.
 */

const CARD =
  "relative flex flex-col items-start p-14 rounded-14 cursor-pointer text-left transition-all duration-240 ease-soft";

const TILE = "w-30 h-30 rounded-10 grid place-items-center";

const TICK = "absolute top-12 right-12 w-16 h-16 rounded-half bg-accent grid place-items-center";

export function PickCard({
  mark,
  title,
  hint,
  on,
  /** The drawing sets the two sets of cards one pixel apart, so the gap is the caller's to say. */
  gap,
  onPick,
}: {
  mark: React.JSX.Element;
  title: string;
  hint: string;
  on: boolean;
  gap: "gap-9" | "gap-10";
  onPick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`hover:-translate-y-2 hover:border-accent-a50 ${CARD} ${gap} border ${on ? "border-accent-a45" : "border-border"} ${on ? "bg-accent-a07" : "bg-card"}`}
    >
      <span
        className={`${TILE} ${on ? "bg-accent-a16" : "bg-tile"} ${on ? "text-accent-soft" : "text-ink-faint"}`}
      >
        {mark}
      </span>
      <span className="block">
        <span
          className={`block text-13 font-semibold ${on ? "text-accent-soft" : "text-ink-warm"}`}
        >
          {title}
        </span>
        <span className="block text-11h text-ink-meta mt-4 leading-body">{hint}</span>
      </span>
      {on ? (
        <span className={TICK}>
          <Tick />
        </span>
      ) : null}
    </button>
  );
}
