import { useTranslation } from "react-i18next";
import type { Source } from "./add-project-inspect.ts";
import { PickCard } from "./pick-card.tsx";

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
    <PickCard
      mark={MARKS[kind]}
      title={t(kind === "local" ? "project.sourceLocal" : "project.sourceGit")}
      hint={t(kind === "local" ? "project.sourceLocalHint" : "project.sourceGitHint")}
      on={on}
      gap="gap-10"
      onPick={onPick}
    />
  );
}
