import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { DISPLAY } from "./tokens.ts";
import { useDesign } from "./store.ts";

const SHELL = "absolute inset-0 z-30 bg-sheet flex flex-col animate-slide-360";

export const PRIMARY =
  "flex-1 p-11 rounded-11 border-0 bg-accent text-accent-ink text-12h font-semibold cursor-pointer transition-all duration-220";

export const CAPS = "font-mono text-10 tracking-caps uppercase text-ink-label";

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
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  return (
    <div className={SHELL}>
      <div className="flex-[0_0_auto] flex items-center gap-11 py-14 px-16 border-b border-line">
        <button
          aria-label={t("common.back")}
          type="button"
          onClick={() => {
            set({ sheet: null, sheetDraft: null });
          }}
          className="hover:text-accent-soft hover:border-accent-a45 w-30 h-30 flex-[0_0_30px] grid place-items-center border border-border-strong rounded-9 py-1 px-6 bg-transparent text-ink-quiet cursor-pointer transition-all duration-200"
        >
          <ChevronLeft size={12} strokeWidth={1.6} />
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
