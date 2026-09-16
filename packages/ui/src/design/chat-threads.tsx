import { useTranslation } from "react-i18next";
import type { Floor, ThreadPick } from "./data.ts";
import { useDesign } from "./store.ts";
import { MONO } from "./tokens.ts";

const ROW = "flex-[0_0_auto] flex items-center gap-6 pt-10 px-16 overflow-x-auto";

const CHIP =
  "flex items-center gap-7 h-26 flex-[0_0_auto] max-w-200 py-0 px-10 rounded-8 border text-11 cursor-pointer transition-all duration-200";

const IDLE = "border-border-strong bg-transparent text-ink-quiet";

const LIVE = "border-accent-a45 bg-accent-a10 text-accent-soft";

const NAME = "overflow-hidden text-ellipsis whitespace-nowrap";

const PLUS =
  "w-26 h-26 flex-[0_0_26px] grid place-items-center rounded-8 border border-border-strong bg-transparent text-ink-quiet cursor-pointer transition-all duration-200";

export function ChatThreads({
  floor,
  active,
}: {
  floor: Floor;
  active: ThreadPick | "new";
}): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  return (
    <div className={ROW}>
      <button
        type="button"
        aria-label={t("chat.newThread")}
        title={t("chat.newThread")}
        onClick={() => {
          set({ thread: "new", query: "", searchOpen: false });
        }}
        className={`hover:text-accent-soft hover:border-accent-a45 ${PLUS}`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5">
          <line x1="6" y1="2" x2="6" y2="10" strokeLinecap="round" />
          <line x1="2" y1="6" x2="10" y2="6" strokeLinecap="round" />
        </svg>
      </button>
      {active === "new" ? (
        <span className={`${CHIP} ${LIVE}`}>
          <span className={NAME}>{t("chat.newThread")}</span>
        </span>
      ) : null}
      {floor.threads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          title={thread.title}
          onClick={() => {
            set({ thread: thread.id, query: "", searchOpen: false });
          }}
          className={`hover:border-accent-a45 ${CHIP} ${thread.id === active ? LIVE : IDLE}`}
        >
          <span className={NAME}>{thread.title}</span>
          <span className={`${MONO} text-9h text-ink-label`}>{thread.count}</span>
        </button>
      ))}
    </div>
  );
}
