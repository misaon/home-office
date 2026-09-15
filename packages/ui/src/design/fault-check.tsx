import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import { MONO, separator } from "./tokens.ts";

/** One line of the office's own report: what it looked at, and how that answered. */
export type Check = { name: ParseKeys; state: ParseKeys; ok: boolean };

const TICK = (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="1.8,5.2 4,7.4 8.2,2.6" />
  </svg>
);

const CROSS = (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
  >
    <line x1="2.4" y1="2.4" x2="7.6" y2="7.6" />
    <line x1="7.6" y1="2.4" x2="2.4" y2="7.6" />
  </svg>
);

const MARK = "w-18 h-18 flex-[0_0_18px] rounded-6 grid place-items-center";

const NAME =
  "flex-1 min-w-0 text-12h text-ink-soft overflow-hidden text-ellipsis whitespace-nowrap";

export function CheckRow({ check, first }: { check: Check; first: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const fg = check.ok ? "text-good-soft" : "text-bad-soft";
  return (
    <div className={`flex items-center gap-11 py-13 px-14 ${separator(first)}`}>
      <span
        className={`${MARK} ${check.ok ? "bg-good-a16 text-good-soft" : "bg-bad-a16 text-bad-soft"}`}
      >
        {check.ok ? TICK : CROSS}
      </span>
      <span className={NAME}>{t(check.name)}</span>
      <span className={`${MONO} text-10h flex-[0_0_auto] ${fg}`}>{t(check.state)}</span>
    </div>
  );
}
