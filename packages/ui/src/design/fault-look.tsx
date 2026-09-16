import type { Variant } from "./fault-body.tsx";
import { DISPLAY, MONO } from "./tokens.ts";

export const ICONS: Record<Variant, React.JSX.Element> = {
  crash: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M10 2.6 2.2 16.4h15.6z" />
      <line x1="10" y1="7.6" x2="10" y2="11.6" />
      <circle cx="10" cy="13.9" r=".95" fill="currentColor" stroke="none" />
    </svg>
  ),
  config: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 3h7l4 4v10H4z" />
      <polyline points="11,3 11,7 15,7" />
      <line x1="9.5" y1="10" x2="9.5" y2="12.6" />
      <circle cx="9.5" cy="14.6" r=".85" fill="currentColor" stroke="none" />
    </svg>
  ),
  offline: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <rect x="2.6" y="4" width="14.8" height="5" rx="1.6" />
      <rect x="2.6" y="11" width="14.8" height="5" rx="1.6" />
      <line x1="5.4" y1="6.5" x2="5.4" y2="6.5" />
      <line x1="5.4" y1="13.5" x2="5.4" y2="13.5" />
      <line x1="14" y1="2.6" x2="6" y2="17.4" />
    </svg>
  ),
};

export const GROUND =
  "fixed inset-0 z-95 bg-ground flex items-center justify-center p-32 overflow-y-auto animate-fade-300";

export const TILE = "w-48 h-48 flex-[0_0_48px] rounded-15 grid place-items-center";

export const KIND = `${MONO} text-9h tracking-caps-widest uppercase`;

export const TITLE = `${DISPLAY} font-bold text-27 tracking-display leading-title mt-10 text-pretty`;

export const BODY = "text-13 text-ink-label mt-12 leading-read text-pretty";

export const CARD = "mt-24 rounded-15 bg-card border border-edge overflow-hidden";

export const TOGGLE =
  "flex items-center gap-8 mt-14 p-0 border-0 bg-transparent text-ink-quiet text-12 cursor-pointer transition-[color] duration-200";

export const LOG = `mt-11 mx-0 mb-0 p-14 rounded-13 bg-sunk border border-edge ${MONO} text-11 leading-log text-ink-faint whitespace-pre-wrap break-words animate-rise-280`;

export const PRIMARY =
  "flex items-center gap-9 py-13 px-20 rounded-13 border-0 bg-accent text-accent-ink text-13 font-semibold cursor-pointer transition-all duration-220 ease-soft";

export const QUIET =
  "py-13 rounded-13 border border-border-strong bg-transparent text-13 text-ink-quiet cursor-pointer transition-all duration-200";
