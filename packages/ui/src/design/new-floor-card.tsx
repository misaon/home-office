import { useTranslation } from "react-i18next";
import type { Source } from "./add-project-inspect.ts";

/** One of the two places a floor's code can live, as the card the drawing picks it with. */

const MARKS: Record<Source, React.JSX.Element> = {
  local: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M2 4.6a1 1 0 0 1 1-1h3l1.4 1.6H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
    </svg>
  ),
  git: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="4.4" cy="4" r="1.8" />
      <circle cx="4.4" cy="12" r="1.8" />
      <circle cx="11.6" cy="8" r="1.8" />
      <path d="M4.4 5.8v4.4M6.2 4.6h2.6a1.2 1.2 0 0 1 1.2 1.2v.6" />
    </svg>
  ),
};

const CARD =
  "relative flex flex-col items-start gap-10 p-14 rounded-14 cursor-pointer text-left transition-all duration-240 ease-soft";

export function SourceCard({
  kind,
  on,
  onPick,
}: {
  kind: Source;
  on: boolean;
  onPick: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onPick}
      className={`hover:-translate-y-2 hover:border-accent-a50 ${CARD} border ${on ? "border-accent-a45" : "border-border"} ${on ? "bg-accent-a07" : "bg-card"}`}
    >
      <span
        className={`w-30 h-30 rounded-10 grid place-items-center ${on ? "bg-accent-a16" : "bg-tile"} ${on ? "text-accent-soft" : "text-ink-faint"}`}
      >
        {MARKS[kind]}
      </span>
      <span className="block">
        <span
          className={`block text-13 font-semibold ${on ? "text-accent-soft" : "text-ink-warm"}`}
        >
          {t(kind === "local" ? "project.sourceLocal" : "project.sourceGit")}
        </span>
        <span className="block text-11h text-ink-meta mt-4 leading-body">
          {t(kind === "local" ? "project.sourceLocalHint" : "project.sourceGitHint")}
        </span>
      </span>
      {on ? (
        <span className="absolute top-12 right-12 w-16 h-16 rounded-half bg-accent grid place-items-center">
          <svg
            className="stroke-accent-ink"
            width="9"
            height="9"
            viewBox="0 0 10 10"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="1.8,5.2 4,7.4 8.2,2.6" />
          </svg>
        </span>
      ) : null}
    </button>
  );
}
