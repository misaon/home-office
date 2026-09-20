import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { ClickableRow } from "./clickable-row.tsx";
import type { Card, Floor } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { ELLIPSIS, MONO, priorityDot, priorityInk } from "./tokens.ts";
import { bossOf } from "./live.ts";
import { useDesign, useOfficeMutation } from "./store.ts";

const BODY = "flex-1 min-w-0 py-12 px-13";

const TITLE = "flex-1 min-w-0 text-13 leading-tight-body text-ink-pale text-pretty";

const AVATAR = "w-20 h-20 flex-[0_0_20px] rounded-7 grid place-items-center text-9h font-semibold";

const BIN =
  "w-20 h-20 flex-[0_0_20px] grid place-items-center border-0 rounded-6 py-1 px-6 bg-transparent text-ink-idle cursor-pointer transition-all duration-200";

const META = `flex items-center gap-8 mt-8 ${MONO} text-10 text-ink-meta flex-wrap`;

export function BoardCard({
  floor,
  card,
  first,
  stripe,
}: {
  floor: Floor;
  card: Card;
  first: boolean;
  stripe: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  const confirm = useDesign((s) => s.confirm);
  const remove = useOfficeMutation({
    mutationFn: () => requireClient().tasks.remove({ id: card.id }),
  });
  const mine = card.who === bossOf(floor)?.name;
  const ink = priorityInk(card.priority);
  const mark = priorityDot(card.priority);
  const open = (): void => {
    set({ sheet: { type: "task", id: card.id } });
  };

  return (
    <ClickableRow label={card.title} first={first} stripe={stripe} onOpen={open}>
      <div className={BODY}>
        <div className="flex items-start gap-10">
          <div className={TITLE}>{card.title}</div>
          <span
            className={`${AVATAR} ${mine ? "bg-accent-a18" : "bg-border"} ${mine ? "text-accent-soft" : "text-ink-mute"}`}
          >
            <span>{card.who === "" ? "·" : card.who.charAt(0)}</span>
          </span>
          <button
            type="button"
            aria-label={t("board.remove")}
            disabled={remove.isPending}
            onClick={(e) => {
              e.stopPropagation();
              confirm({
                title: t("board.removeTitle"),
                body: t(card.lane === "running" ? "board.removeRunning" : "board.removeConfirm", {
                  title: card.title,
                  name: card.who,
                }),
                okLabel: t("board.removeAction"),
                act: () => {
                  remove.mutate();
                },
              });
            }}
            title={t("board.remove")}
            className={`hover:text-bad hover:bg-bad-a12 ${BIN}`}
          >
            <Trash2 size={11} strokeWidth={1.4} />
          </button>
        </div>
        <div className={META}>
          <span className={`flex items-center gap-5 ${ink}`}>
            <span className={`w-5 h-5 rounded-1 ${mark}`} />
            <span>{t(`priority.${card.priority}`)}</span>
          </span>
          <span className="opacity-40">·</span>
          <span>{t(`taskKind.${card.kind}`)}</span>
          {card.request === null ? null : (
            <>
              <span className="opacity-40">·</span>
              <span className={`${ELLIPSIS} max-w-160`} title={card.request}>
                {card.request}
              </span>
            </>
          )}
          <span className="opacity-40">·</span>
          <span>{card.who === "" ? t("board.unassigned") : card.who}</span>
          <span className="opacity-40">·</span>
          <span>{card.at}</span>
        </div>
      </div>
    </ClickableRow>
  );
}
