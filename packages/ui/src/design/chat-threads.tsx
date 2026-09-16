import { Popover } from "@base-ui/react/popover";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Floor, Thread, ThreadPick } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { useDesign, useOfficeMutation } from "./store.ts";
import { MONO } from "./tokens.ts";

const ROW = "flex-[0_0_auto] flex items-center gap-6 pt-10 px-16";

const STRIP = "ho-strip flex-1 min-w-0 flex items-center gap-6 overflow-x-auto";

const CHIP =
  "flex items-center gap-7 h-26 flex-[0_0_auto] max-w-200 py-0 px-10 rounded-8 border text-11 cursor-pointer transition-all duration-200";

const IDLE = "border-border-strong bg-transparent text-ink-quiet";

const LIVE = "border-accent-a45 bg-accent-a10 text-accent-soft";

const NAME = "overflow-hidden text-ellipsis whitespace-nowrap";

const SQUARE =
  "w-26 h-26 flex-[0_0_26px] grid place-items-center rounded-8 border border-border-strong bg-transparent text-ink-quiet cursor-pointer transition-all duration-200";

const MORE =
  "h-26 flex-[0_0_auto] flex items-center gap-5 px-8 rounded-8 border border-border-strong bg-transparent text-ink-quiet cursor-pointer transition-all duration-200";

const POPOVER =
  "w-300 p-12 rounded-14 bg-pop border border-border-strong shadow-lightbox origin-(--transform-origin) transition-[opacity,translate] duration-300 ease-out data-starting-style:opacity-0 data-starting-style:translate-y-8 data-ending-style:opacity-0";

const SEARCH =
  "w-full mb-9 py-7 px-10 rounded-9 bg-sunk border border-border-strong text-12h placeholder:text-ink-ghost";

const DROP =
  "w-22 h-22 flex-[0_0_22px] grid place-items-center rounded-6 border-0 bg-transparent text-ink-label cursor-pointer transition-all duration-200 disabled:opacity-40";

const ITEM =
  "w-full flex items-center gap-8 py-8 px-9 rounded-9 border bg-transparent text-left cursor-pointer transition-all duration-200";

const INLINE_LIMIT = 2;

function ThreadMenu({
  floor,
  threads,
  active,
  onPick,
}: {
  floor: Floor;
  threads: readonly Thread[];
  active: ThreadPick | "new";
  onPick: (id: ThreadPick) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const confirm = useDesign((s) => s.confirm);
  const flash = useDesign((s) => s.flash);
  const drop = useOfficeMutation({
    mutationFn: (id: ThreadPick) =>
      requireClient().chat.clear({
        projectId: floor.id,
        ...(id === "main" ? {} : { threadId: id }),
      }),
    onSuccess: (result) => {
      flash(t("chat.cleared", { count: result.removed }));
    },
  });
  const needle = query.trim().toLowerCase();
  const shown =
    needle === "" ? threads : threads.filter((one) => one.title.toLowerCase().includes(needle));

  return (
    <Popover.Portal>
      <Popover.Positioner className="z-70 outline-none" sideOffset={10} side="top" align="end">
        <Popover.Popup className={POPOVER}>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder={t("chat.searchSessions")}
            className={SEARCH}
          />
          <div className="max-h-260 overflow-y-auto flex flex-col gap-4">
            {shown.map((one) => (
              <div key={one.id} className="flex items-center gap-2">
                <button
                  type="button"
                  title={one.title}
                  onClick={() => {
                    onPick(one.id);
                  }}
                  className={`hover:border-accent-a45 ${ITEM} ${one.id === active ? LIVE : "border-transparent text-ink-quiet"}`}
                >
                  <span className={`flex-1 min-w-0 text-12h ${NAME}`}>{one.title}</span>
                  <span className={`${MONO} text-9h text-ink-label flex-[0_0_auto]`}>
                    {one.when}
                  </span>
                  <span className={`${MONO} text-9h text-ink-label flex-[0_0_auto]`}>
                    {one.count}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t("chat.clear")}
                  title={t("chat.clear")}
                  disabled={drop.isPending}
                  onClick={() => {
                    confirm({
                      title: t("chat.clearTitle"),
                      body: t("chat.clearConfirm", { count: one.count }),
                      okLabel: t("chat.clear"),
                      act: () => {
                        drop.mutate(one.id);
                      },
                    });
                  }}
                  className={`hover:text-bad-soft ${DROP}`}
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
            ))}
            {shown.length === 0 ? (
              <div className="py-14 text-center text-11h text-ink-label">
                {t("chat.noSessionMatch")}
              </div>
            ) : null}
          </div>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}

export function ChatThreads({
  floor,
  active,
}: {
  floor: Floor;
  active: ThreadPick | "new";
}): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const [menuOpen, setMenuOpen] = useState(false);
  const current = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    current.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active]);

  const pick = (thread: ThreadPick | "new"): void => {
    set({ thread, query: "", searchOpen: false });
    setMenuOpen(false);
  };

  return (
    <div className={ROW}>
      <button
        type="button"
        aria-label={t("chat.newThread")}
        title={t("chat.newThread")}
        onClick={() => {
          pick("new");
        }}
        className={`hover:text-accent-soft hover:border-accent-a45 ${SQUARE}`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5">
          <line x1="6" y1="2" x2="6" y2="10" strokeLinecap="round" />
          <line x1="2" y1="6" x2="10" y2="6" strokeLinecap="round" />
        </svg>
      </button>
      <div className={STRIP}>
        {active === "new" ? (
          <span className={`${CHIP} ${LIVE}`}>
            <span className={NAME}>{t("chat.newThread")}</span>
          </span>
        ) : null}
        {floor.threads.map((thread) => (
          <button
            key={thread.id}
            ref={thread.id === active ? current : undefined}
            type="button"
            title={thread.title}
            onClick={() => {
              pick(thread.id);
            }}
            className={`hover:border-accent-a45 ${CHIP} ${thread.id === active ? LIVE : IDLE}`}
          >
            <span className={NAME}>{thread.title}</span>
            <span className={`${MONO} text-9h text-ink-label`}>{thread.count}</span>
          </button>
        ))}
      </div>
      {floor.threads.length > INLINE_LIMIT ? (
        <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Popover.Trigger
            aria-label={t("chat.allSessions")}
            title={t("chat.allSessions")}
            className={`hover:text-accent-soft hover:border-accent-a45 ${MORE}`}
          >
            <span className={`${MONO} text-9h`}>{floor.threads.length}</span>
            <svg width="11" height="11" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5">
              <line x1="2" y1="3.5" x2="10" y2="3.5" strokeLinecap="round" />
              <line x1="2" y1="6" x2="10" y2="6" strokeLinecap="round" />
              <line x1="2" y1="8.5" x2="10" y2="8.5" strokeLinecap="round" />
            </svg>
          </Popover.Trigger>
          <ThreadMenu floor={floor} threads={floor.threads} active={active} onPick={pick} />
        </Popover.Root>
      ) : null}
    </div>
  );
}
