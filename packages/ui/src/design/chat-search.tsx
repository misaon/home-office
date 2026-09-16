import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

const BAR = "flex-[0_0_auto] flex items-center gap-9 py-9 px-16 border-b border-line";

const FIELD =
  "flex-1 min-w-0 flex items-center gap-8 py-7 px-10 rounded-10 bg-sunk border border-accent-a35 animate-fade-200";

const CLOSE =
  "w-24 h-24 flex-[0_0_24px] grid place-items-center rounded-7 border-0 bg-transparent text-ink-quiet cursor-pointer transition-all duration-200";

export function ChatSearch({ hits }: { hits: string }): React.JSX.Element {
  const { t } = useTranslation();
  const query = useDesign((s) => s.query);
  const set = useDesign((s) => s.set);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  return (
    <div className={BAR}>
      <div className={FIELD}>
        <svg
          className="flex-[0_0_auto] stroke-ink-label"
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
          strokeWidth="1.5"
        >
          <circle cx="6" cy="6" r="4.2" />
          <line x1="9.2" y1="9.2" x2="12.4" y2="12.4" strokeLinecap="round" />
        </svg>
        <input
          ref={field}
          value={query}
          onChange={(e) => {
            set({ query: e.target.value });
          }}
          placeholder={t("chat.search")}
          className="flex-1 min-w-0 border-0 bg-transparent text-12h py-1 px-0 placeholder:text-ink-ghost"
        />
        <span className={`${MONO} text-10 text-ink-label flex-[0_0_auto]`}>{hits}</span>
      </div>
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={() => {
          set({ searchOpen: false, query: "" });
        }}
        className={`hover:text-ink ${CLOSE}`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <line x1="2" y1="2" x2="8" y2="8" />
          <line x1="8" y1="2" x2="2" y2="8" />
        </svg>
      </button>
    </div>
  );
}
