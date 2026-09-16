import { Toggle } from "@base-ui/react/toggle";
import { DISPLAY, MONO } from "./tokens.ts";
import { useTranslation } from "react-i18next";
import type { Floor, Member } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { useDesign, useOfficeMutation } from "./store.ts";

const BAR = "flex-[0_0_auto] flex items-center gap-11 py-14 px-16 border-b border-line";

const AVATAR = `w-34 h-34 rounded-11 bg-gold grid place-items-center ${DISPLAY} font-bold text-14 text-accent-ink-deep`;

const ONLINE = "absolute -right-2 -bottom-2 w-10 h-10 rounded-half bg-good border-2 border-sunk";

const SEARCH =
  "flex-1 min-w-0 flex items-center gap-8 py-8 px-11 rounded-10 bg-sunk border border-accent-a35 animate-fade-200";

const SPEC = `${MONO} text-10h text-ink-label mt-2 overflow-hidden text-ellipsis whitespace-nowrap`;

export function ChatHeader({
  floor,
  boss,
  hits,
}: {
  floor: Floor;
  boss: Member | undefined;
  hits: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const query = useDesign((s) => s.query);
  const searchOpen = useDesign((s) => s.searchOpen);
  const set = useDesign((s) => s.set);
  const confirm = useDesign((s) => s.confirm);
  const flash = useDesign((s) => s.flash);
  const clear = useOfficeMutation({
    mutationFn: () => requireClient().chat.clear({ projectId: floor.id }),
    onSuccess: (result) => {
      flash(t("chat.cleared", { count: result.removed }));
    },
  });

  return (
    <div className={BAR}>
      <div className="relative w-34 h-34 flex-[0_0_34px]">
        <div className={AVATAR}>
          <span>{boss?.i ?? "?"}</span>
        </div>
        <span className={ONLINE} />
      </div>
      {searchOpen ? (
        <div className={SEARCH}>
          <input
            value={query}
            onChange={(e) => {
              set({ query: e.target.value });
            }}
            placeholder={t("chat.search")}
            className="flex-1 min-w-0 border-0 bg-transparent text-12h py-1 px-2 placeholder:text-ink-ghost"
          />
          <span className={`${MONO} text-10 text-ink-label flex-[0_0_auto]`}>{hits}</span>
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <div className={`${DISPLAY} font-semibold text-14`}>{boss?.name ?? t("chat.noBoss")}</div>
          <div className={SPEC}>
            {boss === undefined
              ? floor.name
              : `${boss.role} · ${boss.model.toLowerCase()} / ${boss.effort} · ${floor.name}`}
          </div>
        </div>
      )}
      {floor.messages.length === 0 ? null : (
        <button
          type="button"
          aria-label={t("chat.clear")}
          title={t("chat.clear")}
          disabled={clear.isPending}
          onClick={() => {
            confirm({
              title: t("chat.clearTitle"),
              body: t("chat.clearConfirm", { count: floor.messages.length }),
              okLabel: t("chat.clear"),
              act: () => {
                clear.mutate();
              },
            });
          }}
          className="hover:text-accent-soft hover:border-accent-a45 w-30 h-30 flex-[0_0_30px] grid place-items-center border border-border-strong rounded-9 bg-transparent text-ink-quiet cursor-pointer transition-all duration-200 disabled:opacity-50"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M2.4 3.8h9.2M5.6 3.8V2.6h2.8v1.2M3.6 3.8l.6 7.6h5.6l.6-7.6" />
          </svg>
        </button>
      )}
      <Toggle
        aria-label={t("chat.search")}
        pressed={searchOpen}
        onPressedChange={(next) => {
          set({ searchOpen: next, query: "" });
        }}
        className="hover:text-accent-soft hover:border-accent-a45 w-30 h-30 flex-[0_0_30px] grid place-items-center border border-border-strong rounded-9 py-1 px-6 bg-transparent text-ink-quiet data-pressed:text-accent-soft cursor-pointer transition-all duration-200"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="6" cy="6" r="4.2" />
          <line x1="9.2" y1="9.2" x2="12.4" y2="12.4" strokeLinecap="round" />
        </svg>
      </Toggle>
    </div>
  );
}
