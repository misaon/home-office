import { DISPLAY } from "./tokens.ts";
import { useDesign } from "./store.ts";

const SHELL = "absolute inset-0 z-30 bg-sheet flex flex-col animate-slide-360";

export const PRIMARY =
  "flex-1 p-11 rounded-11 border-0 bg-accent text-accent-ink text-12h font-semibold cursor-pointer transition-all duration-220";

export const CAPS = "font-mono text-10 tracking-caps uppercase text-ink-label";

/** A sheet slides over the panel it came from: a back arrow, a title, and the body under it. */
export function SheetShell({
  title,
  subtitle,
  titleClass,
  children,
}: {
  title: string;
  subtitle?: string;
  titleClass?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const set = useDesign((s) => s.set);
  return (
    <div className={SHELL}>
      <div className="flex-[0_0_auto] flex items-center gap-11 py-14 px-16 border-b border-line">
        <button
          aria-label="Back"
          type="button"
          onClick={() => {
            set({ sheet: null, sheetDraft: null, openSelect: null });
          }}
          className="hover:text-accent-soft hover:border-accent-a45 w-30 h-30 flex-[0_0_30px] grid place-items-center border border-border-strong rounded-9 py-1 px-6 bg-transparent text-ink-quiet cursor-pointer transition-all duration-200"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <polyline points="7.5,2.5 4,6 7.5,9.5" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className={`${DISPLAY} font-semibold ${titleClass ?? "text-15"}`}>{title}</div>
          {subtitle === undefined ? null : (
            <div className="font-mono text-10h text-ink-label mt-2">{subtitle}</div>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-16">{children}</div>
    </div>
  );
}
