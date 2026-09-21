import { EffortLevel, type SessionMode } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { ROLE_KEY } from "../i18n/labels.ts";
import { effortMark } from "./agent-marks.tsx";
import { Avatar } from "./avatar.tsx";
import { CopyButton } from "./chat-copy.tsx";
import { ChangeRow, LastWords, latestChanges, StepRow } from "./chat-session-rows.tsx";
import type { SessionCard } from "./data.ts";
import { RichText } from "./markdown.tsx";
import { DISPLAY, ELLIPSIS, MONO } from "./tokens.ts";

export const DOING_KEY = {
  work: "chat.doingWork",
  review: "chat.doingReview",
  triage: "chat.doingTriage",
  plan: "chat.doingPlan",
  verify: "chat.doingVerify",
} as const satisfies Record<SessionMode, string>;

const DONE_KEY = {
  work: "chat.doneWork",
  review: "chat.doneReview",
  triage: "chat.doneTriage",
  plan: "chat.donePlan",
  verify: "chat.doneVerify",
} as const satisfies Record<SessionMode, string>;

export const MODE_DOT: Readonly<Record<SessionMode, string>> = {
  work: "bg-accent",
  review: "bg-mode-review",
  triage: "bg-mode-plan",
  plan: "bg-mode-plan",
  verify: "bg-mode-verify",
};

const MODE_CHIP: Readonly<Record<SessionMode, string>> = {
  work: "border-accent-a30 bg-accent-a12 text-accent-soft",
  review: "border-mode-review/35 bg-mode-review/15 text-mode-review",
  triage: "border-mode-plan/35 bg-mode-plan/15 text-mode-plan",
  plan: "border-mode-plan/35 bg-mode-plan/15 text-mode-plan",
  verify: "border-mode-verify/35 bg-mode-verify/15 text-mode-verify",
};

const EDGE: Readonly<Record<SessionCard["outcome"], string>> = {
  running: "border-accent-a30",
  done: "border-border",
  failed: "border-bad-a45",
};

const CARD =
  "group relative w-full rounded-16 border bg-[linear-gradient(180deg,var(--color-card-lit),var(--color-panel))] shadow-[inset_0_1px_0_var(--color-glint-a05)] animate-lift-300";

const HEAD = "flex items-center gap-7 py-9 pl-10 pr-9 flex-wrap";

const NAME = `${DISPLAY} font-semibold text-12h text-ink-pale ${ELLIPSIS}`;

const CHIP = `${MONO} text-9h h-18 px-7 rounded-pill border flex items-center gap-5 flex-[0_0_auto] leading-none`;

const QUIET = "border-border bg-sunk text-ink-label";

const BODY = "flex flex-col gap-8 px-10 pb-10";

const NOW = "flex items-center gap-8 py-7 px-9 rounded-10 bg-sunk border border-accent-a20";

const DOT = "w-4 h-4 rounded-half bg-accent animate-dots wait";

const FILES = "flex flex-col gap-1 py-4 px-7 rounded-9 bg-sunk border border-line";

const TEXT = "text-12h leading-text text-ink-soft border-t border-line pt-8";

const FOOT = `flex items-center gap-7 px-10 py-7 border-t border-line ${MONO} text-9h text-ink-label flex-wrap`;

const STEPS_SHOWN = 6;

const money = (usd: number): string => (usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`);

const Separator = (): React.JSX.Element => (
  <span className="opacity-40" aria-hidden="true">
    ·
  </span>
);

function Dots(): React.JSX.Element {
  return (
    <span className="flex items-center gap-3 flex-[0_0_auto]">
      {["0s", ".15s", ".3s"].map((delay) => (
        <span key={delay} className={DOT} style={{ "--wait": delay }} />
      ))}
    </span>
  );
}

function Header({ card }: { card: SessionCard }): React.JSX.Element {
  const { t } = useTranslation();
  const effort = EffortLevel.safeParse(card.effort);
  return (
    <div className={HEAD}>
      <Avatar initial={card.initial} role={card.role} size="sm" />
      <span className={NAME}>{card.name}</span>
      <span className={`${CHIP} ${QUIET}`}>{t(ROLE_KEY[card.role])}</span>
      <span className={`${CHIP} ${MODE_CHIP[card.mode]}`}>
        <span className={`w-5 h-5 rounded-half ${MODE_DOT[card.mode]}`} aria-hidden="true" />
        {t(card.live ? DOING_KEY[card.mode] : DONE_KEY[card.mode])}
      </span>
      <span className={`${CHIP} ${QUIET} text-accent-quote`} title={card.model}>
        {card.model}
      </span>
      <span className={`${CHIP} ${QUIET}`} title={t("chat.effort", { level: card.effort })}>
        {effort.success ? effortMark(effort.data) : null}
        {card.effort}
      </span>
      <span
        className={`ml-auto ${MONO} text-10h flex-[0_0_auto] ${card.live ? "text-accent-soft" : "text-ink-label"}`}
      >
        {card.since}
      </span>
      {card.text === "" ? null : <CopyButton text={card.text} className="flex-[0_0_auto]" />}
    </div>
  );
}

function NowLine({ card }: { card: SessionCard }): React.JSX.Element {
  const { t } = useTranslation();
  const last = card.steps.findLast((step) => step.kind === "tool");
  const doing =
    card.activity ??
    (last === undefined ? t(DOING_KEY[card.mode]) : `${last.tool} ${last.detail}`.trim());
  return (
    <div className={NOW}>
      <Dots />
      <span className={`flex-1 min-w-0 text-11h text-ink-quiet ${ELLIPSIS}`}>{doing}</span>
    </div>
  );
}

function Footer({ card, changed }: { card: SessionCard; changed: number }): React.JSX.Element {
  const { t } = useTranslation();
  const failed = card.outcome === "failed";
  return (
    <div className={FOOT}>
      <span className={failed ? "text-bad-soft" : "text-good-soft"}>
        {failed ? "✕" : "✓"} {t(failed ? "chat.sessionFailed" : "chat.sessionDone")}
      </span>
      {card.traced ? (
        <>
          <Separator />
          <span>{t("chat.changedFiles", { count: changed })}</span>
        </>
      ) : null}
      {card.turns === 0 ? null : (
        <>
          <Separator />
          <span>{t("chat.turns", { count: card.turns })}</span>
        </>
      )}
      {card.costUsd === null ? null : (
        <>
          <Separator />
          <span className="text-accent-quote">{money(card.costUsd)}</span>
        </>
      )}
    </div>
  );
}

export function ChatSessionCard({ card }: { card: SessionCard }): React.JSX.Element {
  const changes = latestChanges(card.steps);
  const tools = card.steps.filter((step) => step.kind === "tool" && step.change === null);
  const steers = card.steps.filter((step) => step.kind === "steer");
  return (
    <article id={`session-${card.id}`} className={`${CARD} ${EDGE[card.outcome]}`}>
      <Header card={card} />
      <div className={BODY}>
        {card.live ? <NowLine card={card} /> : null}
        {changes.length === 0 ? null : (
          <div className={FILES}>
            {changes.map((change) => (
              <ChangeRow key={change.path} change={change} />
            ))}
          </div>
        )}
        {steers.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
        {card.live && tools.length > 0 ? (
          <div className="flex flex-col gap-6">
            {tools.slice(-STEPS_SHOWN).map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </div>
        ) : null}
        {card.text === "" ? null : card.live ? (
          <div className={`${TEXT} ho-live`}>
            <RichText text={card.text} />
          </div>
        ) : (
          <LastWords text={card.text} />
        )}
      </div>
      {card.live ? null : <Footer card={card} changed={changes.length} />}
    </article>
  );
}
