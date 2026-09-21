import { Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { requireClient } from "../rpc.ts";
import { DOING_KEY, MODE_DOT } from "./chat-session-card.tsx";
import type { SessionCard } from "./data.ts";
import { useDesign, useOfficeMutation } from "./store.ts";
import { DISPLAY, ELLIPSIS, MONO } from "./tokens.ts";

const STRIP = "flex-[0_0_auto] mx-16 mt-8 flex flex-col gap-6";

const ROW =
  "flex items-center gap-9 h-36 pl-11 pr-5 rounded-12 border border-accent-a30 bg-[linear-gradient(90deg,var(--color-accent-a10),var(--color-card-lit)_55%)] shadow-[inset_0_1px_0_var(--color-accent-a12)] animate-rise-240";

const OPEN =
  "flex-1 min-w-0 flex items-center gap-8 bg-transparent border-0 p-0 text-left cursor-pointer";

const DOT = "w-8 h-8 flex-[0_0_8px] rounded-half animate-pulse-dot";

const NAME = `${DISPLAY} font-semibold text-12h text-ink-pale flex-[0_0_auto]`;

const VERB = "text-11h text-ink-quiet flex-[0_0_auto]";

const DOING = `text-11h text-ink-label min-w-0 ${ELLIPSIS}`;

const CHIP = `${MONO} text-9h h-18 px-7 rounded-pill bg-accent-a12 text-accent-quote flex items-center flex-[0_0_auto] leading-none`;

const STOP =
  "w-26 h-26 flex-[0_0_26px] grid place-items-center rounded-8 border border-bad-a28 bg-bad-a12 text-bad-soft cursor-pointer transition-all duration-200 hover:bg-bad-a20 hover:border-bad-a45 disabled:opacity-40";

const SHOWN = 2;

function NowRow({ card }: { card: SessionCard }): React.JSX.Element {
  const { t } = useTranslation();
  const flash = useDesign((s) => s.flash);
  const stop = useOfficeMutation({
    mutationFn: () => requireClient().sessions.stop({ id: card.id }),
    onSuccess: () => {
      flash(t("chat.stopped", { name: card.name }));
    },
  });
  const last = card.steps.findLast((step) => step.kind === "tool");
  const doing =
    card.activity ?? (last === undefined ? card.taskTitle : `${last.tool} ${last.detail}`.trim());
  return (
    <div className={ROW}>
      <button
        type="button"
        title={t("chat.jumpToSession")}
        onClick={() => {
          document
            .querySelector(`[id="session-${card.id}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        className={OPEN}
      >
        <span className={`${DOT} ${MODE_DOT[card.mode]}`} aria-hidden="true" />
        <span className={NAME}>{card.name}</span>
        <span className={VERB}>{t(DOING_KEY[card.mode])}</span>
        <span className={DOING}>{doing}</span>
      </button>
      <span className={`${MONO} text-10h text-accent-soft flex-[0_0_auto]`}>{card.since}</span>
      <span className={CHIP}>{card.model}</span>
      <button
        type="button"
        aria-label={t("chat.stopOk", { name: card.name })}
        title={t("chat.stopTitle", { name: card.name })}
        disabled={stop.isPending}
        onClick={() => {
          stop.mutate();
        }}
        className={STOP}
      >
        <Square size={9} strokeWidth={0} fill="currentColor" />
      </button>
    </div>
  );
}

export function ChatNow({ cards }: { cards: readonly SessionCard[] }): React.JSX.Element | null {
  if (cards.length === 0) {
    return null;
  }
  return (
    <div className={STRIP}>
      {cards.slice(0, SHOWN).map((card) => (
        <NowRow key={card.id} card={card} />
      ))}
    </div>
  );
}
