import { type Floor, type Lane } from "./data.ts";
import { useTranslation } from "react-i18next";
import { requireClient } from "../rpc.ts";
import { DISPLAY } from "./tokens.ts";
import { useDesign, useOfficeMutation } from "./store.ts";
import { type Chip, FilterChips } from "./filter-chips.tsx";

type Key = Lane | "all";

const FILTERS = [
  ["all", "board.all", null],
  ["running", "board.inProgress", "bg-accent"],
  ["blocked", "board.blocked", "bg-bad"],
  ["done", "board.done", "bg-good"],
] as const satisfies readonly [Key, string, string | null][];

/** Which lanes the board is showing, each with how many cards it holds. */
function BoardFilters({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const boardFilter = useDesign((s) => s.boardFilter);
  const set = useDesign((s) => s.set);
  const chips: Chip<Key>[] = FILTERS.map(([key, label, dot]) => ({
    key,
    label,
    dot,
    count: key === "all" ? floor.cards.length : floor.cards.filter((c) => c.s === key).length,
  }));

  return (
    <FilterChips
      label={t("board.filters")}
      chips={chips}
      value={boardFilter}
      onPick={(key) => {
        set({ boardFilter: key });
      }}
    />
  );
}

const SEGMENT = "transition-[width] duration-500 ease-glide";

const TOP = "flex items-baseline justify-between gap-10 mb-14";

const SHARE = `${DISPLAY} font-bold text-30 tracking-display leading-flat whitespace-nowrap`;

const BAR = "flex h-5 rounded-pill overflow-hidden gap-2 mb-14";

const CLEAR =
  "py-6 px-11 rounded-9 border border-border-strong bg-transparent text-11h text-ink-quiet cursor-pointer whitespace-nowrap flex-[0_0_auto] transition-all duration-200";

/** How much of the floor's work is finished, and which lanes you want to look at. */
export function BoardHeader({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const confirm = useDesign((s) => s.confirm);
  const { cards } = floor;
  const total = cards.length === 0 ? 1 : cards.length;
  const done = cards.filter((c) => c.s === "done").length;
  const share = (lane: string): string =>
    `${String(Math.round((cards.filter((c) => c.s === lane).length / total) * 100))}%`;

  const clear = useOfficeMutation({
    mutationFn: () => requireClient().tasks.clear({ projectId: floor.id }),
    onSuccess: (result) => {
      flash(t("board.cleared", { count: result.removed }));
    },
  });

  return (
    <div className="flex-[0_0_auto] pt-16 px-16 pb-14 border-b border-line">
      <div className={TOP}>
        <div className="flex items-baseline gap-9 min-w-0 flex-wrap">
          <span className={SHARE}>{share("done")}</span>
          <span className="text-11h text-ink-label">
            {t("board.finished", { done, total: cards.length })}
          </span>
        </div>
        {done === 0 ? null : (
          <button
            type="button"
            disabled={clear.isPending}
            onClick={() => {
              confirm({
                title: t("board.clearTitle"),
                body: t("board.clearConfirm", { count: done }),
                okLabel: t("board.clear"),
                act: () => {
                  clear.mutate();
                },
              });
            }}
            className={`hover:text-ink hover:border-border-hover hover:bg-raised ${CLEAR}`}
          >
            {t("board.clear")}
          </button>
        )}
      </div>
      <div className={BAR}>
        <div
          className={`${SEGMENT} bg-accent w-(--share)`}
          style={{ "--share": share("running") }}
        />
        <div className={`${SEGMENT} bg-bad w-(--share)`} style={{ "--share": share("blocked") }} />
        <div className={`${SEGMENT} bg-good w-(--share)`} style={{ "--share": share("done") }} />
        <div className="bg-slot flex-1" />
      </div>
      <BoardFilters floor={floor} />
    </div>
  );
}
