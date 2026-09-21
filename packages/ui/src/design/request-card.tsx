import { ChevronDown, ChevronRight } from "lucide-react";
import { evidenceBasis } from "./evidence-basis.ts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CriterionEvidence, Request } from "./data.ts";
import { requireClient } from "../rpc.ts";
import { useDesign, useOfficeMutation } from "./store.ts";
import { CARD, ELLIPSIS, MONO } from "./tokens.ts";

const HEAD =
  "flex items-center gap-8 w-full py-9 px-12 border-0 bg-transparent text-left text-12h text-ink-pale cursor-pointer select-none";
const TAG = `${MONO} text-9h py-3 px-8 rounded-6 bg-edge-lit text-ink-faint flex-[0_0_auto]`;
const BODY = "px-12 pb-11 flex flex-col gap-9";
const CAPTION = `${MONO} text-10 tracking-caps uppercase text-ink-label`;
const ROW = "flex gap-8 items-start text-12h text-ink-dim leading-body";
const SUB = `${MONO} text-10 text-ink-meta mt-2 ${ELLIPSIS}`;
const LINK = "text-accent-quote underline-offset-2 hover:underline";
const TASK =
  "bg-transparent border-0 p-0 text-left text-12h text-ink-dim cursor-pointer flex-1 min-w-0 hover:text-ink-pale";
const ABANDON =
  "hover:text-bad hover:border-bad-a45 py-4 px-9 rounded-6 border border-border-strong bg-transparent text-ink-quiet text-10h cursor-pointer transition-all duration-200 flex-[0_0_auto]";

const MARK: Readonly<Record<CriterionEvidence["mark"], { glyph: string; tone: string }>> = {
  pass: { glyph: "✓", tone: "text-good-soft" },
  fail: { glyph: "✗", tone: "text-bad-soft" },
  claimed: { glyph: "◔", tone: "text-warn" },
  open: { glyph: "○", tone: "text-ink-faint" },
};

const STATUS_TONE: Readonly<Record<Request["status"], string>> = {
  open: "bg-accent-a14 text-accent-soft",
  verifying: "bg-accent-a14 text-accent-soft",
  fulfilled: "bg-good-a12 text-good-soft",
  blocked: "bg-bad-a12 text-bad",
  abandoned: "bg-chip text-ink-faint",
};

function EvidenceNote({ evidence }: { evidence: CriterionEvidence }): React.JSX.Element {
  const { t } = useTranslation();
  const text =
    evidence.mark === "pass"
      ? t("mandate.pass", { name: evidence.by })
      : evidence.mark === "fail"
        ? t("mandate.fail", { name: evidence.by })
        : evidence.mark === "claimed"
          ? t("mandate.claimed", { name: evidence.by })
          : t("mandate.open");
  const basis = evidenceBasis(t, evidence);
  return (
    <div className={SUB} title={evidence.proof === "" ? undefined : evidence.proof}>
      {basis === "" ? text : `${text} · ${basis}`}
    </div>
  );
}

function Condition({
  index,
  text,
  evidence,
}: {
  index: number;
  text: string;
  evidence: CriterionEvidence;
}): React.JSX.Element {
  const mark = MARK[evidence.mark];
  return (
    <li className={ROW}>
      <span className={`${MONO} text-11 flex-[0_0_auto] ${mark.tone}`} aria-hidden="true">
        {mark.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div>
          <span className={`${MONO} text-10 text-ink-meta`}>{index + 1}. </span>
          {text}
        </div>
        <EvidenceNote evidence={evidence} />
      </div>
    </li>
  );
}

function Tasks({ request }: { request: Request }): React.JSX.Element | null {
  const { t } = useTranslation();
  const set = useDesign((s) => s.set);
  if (request.tasks.length === 0) {
    return null;
  }
  return (
    <div>
      <div className={CAPTION}>{t("mandate.tasks")}</div>
      <ul className="list-none m-0 p-0 mt-4 flex flex-col gap-4">
        {request.tasks.map((task) => (
          <li key={task.id} className={ROW}>
            <button
              type="button"
              className={`${TASK} ${ELLIPSIS}`}
              onClick={() => {
                set({ sheet: { type: "task", id: task.id } });
              }}
            >
              {task.title}
            </button>
            <span className={TAG}>{t(`status.${task.status}`)}</span>
            {task.who === "" ? null : (
              <span className={`${MONO} text-10 text-ink-meta flex-[0_0_auto]`}>{task.who}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Footer({ request }: { request: Request }): React.JSX.Element {
  const { t } = useTranslation();
  const confirm = useDesign((s) => s.confirm);
  const flash = useDesign((s) => s.flash);
  const abandon = useOfficeMutation({
    mutationFn: () => requireClient().mandates.abandon({ id: request.id }),
    onSuccess: () => {
      flash(t("mandate.abandoned"));
    },
  });
  return (
    <div className="flex items-center gap-10 flex-wrap">
      {request.prUrl === null ? null : (
        <a
          href={request.prUrl}
          target="_blank"
          rel="noreferrer"
          className={`${MONO} text-10h ${LINK}`}
        >
          {t("mandate.pullRequest")}
        </a>
      )}
      {request.branch === null ? null : (
        <span className={`${MONO} text-10 text-ink-meta ${ELLIPSIS}`}>{request.branch}</span>
      )}
      <span className="flex-1" />
      <button
        type="button"
        disabled={abandon.isPending}
        className={ABANDON}
        onClick={() => {
          confirm({
            title: t("mandate.abandonTitle"),
            body: t("mandate.abandonBody", { title: request.title }),
            okLabel: t("mandate.abandon"),
            act: () => {
              abandon.mutate();
            },
          });
        }}
      >
        {t("mandate.abandon")}
      </button>
    </div>
  );
}

export function RequestCard({ request }: { request: Request }): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const toggle = (): void => {
    setOpen((shown) => !shown);
  };
  return (
    <div className={CARD}>
      <button type="button" className={HEAD} onClick={toggle}>
        {open ? (
          <ChevronDown size={13} aria-hidden="true" />
        ) : (
          <ChevronRight size={13} aria-hidden="true" />
        )}
        <span className={`${MONO} text-10 text-ink-label uppercase tracking-caps flex-[0_0_auto]`}>
          {t("mandate.title")}
        </span>
        <span className={`flex-1 min-w-0 ${ELLIPSIS}`}>{request.title}</span>
        <span className={`${TAG} ${STATUS_TONE[request.status]}`}>
          {t(`mandate.status.${request.status}`)}
        </span>
        {request.round === 0 ? null : (
          <span className={TAG}>{t("mandate.round", { count: request.round })}</span>
        )}
      </button>
      {open ? (
        <div className={BODY}>
          <div>
            <div className={CAPTION}>{t("mandate.conditions")}</div>
            {request.conditions.length === 0 ? (
              <div className="text-12h text-ink-dim leading-body mt-4">
                {t("mandate.noConditions")}
              </div>
            ) : (
              <ol className="list-none m-0 p-0 mt-4 flex flex-col gap-6">
                {request.conditions.map((condition, index) => (
                  <Condition
                    key={condition.text}
                    index={index}
                    text={condition.text}
                    evidence={condition.evidence}
                  />
                ))}
              </ol>
            )}
          </div>
          <Tasks request={request} />
          <Footer request={request} />
        </div>
      ) : null}
    </div>
  );
}
