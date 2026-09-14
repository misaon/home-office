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

const CARD: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "10px",
  padding: "14px",
  borderRadius: "14px",
  cursor: "pointer",
  textAlign: "left",
  transition: "all .24s cubic-bezier(.2,.8,.3,1)",
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
    <button
      type="button"
      onClick={onPick}
      style={{
        ...CARD,
        border: `1px solid ${on ? "rgba(255,197,49,.45)" : "#26262C"}`,
        background: on ? "rgba(255,197,49,.07)" : "#101013",
      }}
      className="ho-4f6a3c"
    >
      <span
        style={{
          width: "30px",
          height: "30px",
          borderRadius: "10px",
          display: "grid",
          placeItems: "center",
          background: on ? "rgba(255,197,49,.16)" : "#1D1D22",
          color: on ? "#FFD666" : "#BEBBB4",
        }}
      >
        {MARKS[kind]}
      </span>
      <span style={{ display: "block" }}>
        <span
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: "600",
            color: on ? "#FFD666" : "#F2EFE8",
          }}
        >
          {t(kind === "local" ? "project.sourceLocal" : "project.sourceGit")}
        </span>
        <span
          style={{
            display: "block",
            fontSize: "11.5px",
            color: "#A6A39C",
            marginTop: "4px",
            lineHeight: "1.5",
          }}
        >
          {t(kind === "local" ? "project.sourceLocalHint" : "project.sourceGitHint")}
        </span>
      </span>
      {on ? (
        <span
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            background: "var(--a,#FFC531)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 10 10"
            fill="none"
            stroke="#150F02"
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
