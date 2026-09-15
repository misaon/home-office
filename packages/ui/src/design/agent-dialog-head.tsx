import { useTranslation } from "react-i18next";
import type { AgentDraft } from "./store.ts";
import { DISPLAY, MONO } from "./tokens.ts";

const AVATAR = `w-44 h-44 flex-[0_0_44px] rounded-14 grid place-items-center ${DISPLAY} font-bold text-18 shadow-tile`;

const PILL = "flex items-center gap-6 pt-3 pr-9 pb-3 pl-7 rounded-pill";

/** Who is being hired or changed, and — when they already work here — what they are at. */
export function AgentDialogHead({
  draft,
  working,
  status,
  sub,
  isEdit,
}: {
  draft: AgentDraft;
  working: boolean;
  status: string;
  sub: string;
  isEdit: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const boss = draft.role === "boss";
  const dot = working ? "bg-accent" : "bg-ink-idle";
  return (
    <>
      <div
        className={`${AVATAR} ${boss ? "bg-gold" : "bg-edge-lit"} ${boss ? "text-accent-ink-deep" : "text-ink-mute"}`}
      >
        <span>{(draft.name === "" ? "?" : draft.name).charAt(0).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-9 flex-wrap">
          <span className={`${DISPLAY} font-bold text-21 tracking-tighter leading-title`}>
            {isEdit ? (draft.name === "" ? t("agent.one") : draft.name) : t("agent.newTitle")}
          </span>
          {isEdit ? (
            <span
              className={`${PILL} ${working ? "bg-accent-a10" : "bg-pill"} border ${working ? "border-accent-a30" : "border-border-strong"}`}
            >
              <span className={`w-5 h-5 rounded-half ${dot}`} />
              <span className={`${MONO} text-9h ${working ? "text-accent-soft" : "text-ink-meta"}`}>
                {status}
              </span>
            </span>
          ) : null}
        </div>
        <div className="text-12h text-ink-label mt-7 leading-prose text-pretty">{sub}</div>
      </div>
    </>
  );
}

/** The one line that says what this colleague is doing right now, above everything you can change. */
export function AgentDoing({
  working,
  doing,
  since,
}: {
  working: boolean;
  doing: string;
  since: string;
}): React.JSX.Element {
  const dot = working ? "bg-accent shadow-glow-gold" : "bg-ink-idle shadow-glow-idle";
  return (
    <div className="flex items-center gap-11 py-13 px-14 rounded-13 bg-card border border-edge mb-20">
      <span className={`w-8 h-8 flex-[0_0_8px] rounded-half ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-12h text-ink-warm overflow-hidden text-ellipsis whitespace-nowrap">
          {doing}
        </div>
        <div className={`${MONO} text-10h text-ink-meta mt-4`}>{since}</div>
      </div>
    </div>
  );
}
