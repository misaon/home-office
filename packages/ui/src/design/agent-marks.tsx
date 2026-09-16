import type { EffortLevel, Gender, ProviderId } from "@ho/protocol";
import { siClaudecode, siGooglegemini, siOpencode } from "simple-icons";

const BOX = "flex-[0_0_14px] w-14 h-14 grid place-items-center";

function Brand({ path, label }: { path: string; label: string }): React.JSX.Element {
  return (
    <span className={BOX}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-label={label}>
        <path d={path} />
      </svg>
    </span>
  );
}

function Caret(): React.JSX.Element {
  return (
    <span className={BOX}>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="5,7 10,12 5,17" />
        <line x1="13" y1="17" x2="19" y2="17" />
      </svg>
    </span>
  );
}

const BRANDS: Record<ProviderId, { path: string; title: string } | null> = {
  "claude-code": siClaudecode,
  opencode: siOpencode,
  "gemini-cli": siGooglegemini,
  codex: null,
};

export function providerMark(id: ProviderId): React.JSX.Element {
  const brand = BRANDS[id];
  return brand === null ? <Caret /> : <Brand path={brand.path} label={brand.title} />;
}

const BARS: Record<EffortLevel, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };

export function effortMark(level: EffortLevel): React.JSX.Element {
  const lit = BARS[level];
  return (
    <span className={`${BOX} gap-[1.5px] items-end`} style={{ display: "flex" }}>
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          className={`w-[1.5px] rounded-[1px] ${step <= lit ? "bg-current" : "bg-current opacity-25"}`}
          style={{ height: `${String(3 + step * 1.8)}px` }}
        />
      ))}
    </span>
  );
}

export function genderMark(gender: Gender): React.JSX.Element {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
  } as const;
  return (
    <span className={BOX}>
      <svg width="12" height="12" viewBox="0 0 16 16" {...stroke}>
        {gender === "female" ? (
          <>
            <circle cx="8" cy="6" r="3.4" />
            <line x1="8" y1="9.4" x2="8" y2="14" />
            <line x1="5.8" y1="12" x2="10.2" y2="12" />
          </>
        ) : gender === "male" ? (
          <>
            <circle cx="6.6" cy="9.4" r="3.4" />
            <line x1="9.2" y1="6.8" x2="13.4" y2="2.6" />
            <polyline points="9.6,2.6 13.4,2.6 13.4,6.4" />
          </>
        ) : (
          <>
            <circle cx="8" cy="7" r="3.2" />
            <line x1="8" y1="10.2" x2="8" y2="13.6" />
          </>
        )}
      </svg>
    </span>
  );
}
