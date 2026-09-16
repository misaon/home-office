import { useTranslation } from "react-i18next";
import { BoardCard } from "./board-card.tsx";
import { BoardHeader } from "./board-header.tsx";
import type { Floor, Lane } from "./data.ts";
import { MONO } from "./tokens.ts";
import { useDesign } from "./store.ts";

const LANES = [
  ["queued", "board.inbox", "bg-ink-lane"],
  ["running", "board.inProgress", "bg-accent"],
  ["blocked", "board.blocked", "bg-bad"],
  ["done", "board.done", "bg-good"],
] as const satisfies readonly [Lane, string, string][];

const RULE = `${MONO} text-10 tracking-caps-wider uppercase text-ink-label`;

const CARD = "rounded-14 bg-card border border-edge overflow-hidden";

export function Board({ floor }: { floor: Floor }): React.JSX.Element {
  const { t } = useTranslation();
  const boardFilter = useDesign((s) => s.boardFilter);

  return (
    <div className="flex flex-col min-h-0 flex-1 animate-slide-420">
      <BoardHeader floor={floor} />
      <div className="flex-1 min-h-0 overflow-y-auto p-16">
        {LANES.filter(([key]) => boardFilter === "all" || boardFilter === key).map(
          ([key, label, dot]) => {
            const items = floor.cards.filter((x) => x.s === key);
            return (
              <div key={key} className="mb-18">
                <div className="flex items-center gap-8 mt-0 mx-2 mb-9">
                  <span className={`w-6 h-6 rounded-half ${dot}`} />
                  <span className={RULE}>{t(label)}</span>
                  <span className="flex-1 h-1 bg-slot" />
                  <span className={`${MONO} text-10h text-ink-meta`}>{items.length}</span>
                </div>
                <div className={CARD}>
                  {items.map((card, i) => (
                    <BoardCard
                      key={card.id}
                      floor={floor}
                      card={card}
                      first={i === 0}
                      stripe={dot}
                    />
                  ))}
                  {items.length === 0 ? (
                    <div className="py-16 px-13 text-12 text-ink-meta">{t("board.emptyLane")}</div>
                  ) : null}
                </div>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
