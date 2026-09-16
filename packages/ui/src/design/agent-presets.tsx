import { defaultChoice } from "@ho/core";
import { type AgentRole, type EffortLevel, ProviderId } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { ROLE_MARKS } from "./agent-roles.tsx";
import type { AgentDraft } from "./store.ts";

const PRESET_IDS = ["triage", "builder", "quick", "reviewer"] as const;
type PresetId = (typeof PRESET_IDS)[number];

const SHAPE: Record<PresetId, { role: AgentRole; effort: EffortLevel }> = {
  triage: { role: "boss", effort: "medium" },
  builder: { role: "worker", effort: "medium" },
  quick: { role: "worker", effort: "low" },
  reviewer: { role: "reviewer", effort: "medium" },
};

const CARD =
  "flex items-start gap-9 text-left py-10 px-12 rounded-11 border border-border bg-card cursor-pointer transition-all duration-200 hover:border-accent-a35 hover:bg-card-lit";

const presetDraft = (id: PresetId, draft: AgentDraft, name: string): AgentDraft => {
  const { role, effort } = SHAPE[id];
  const provider = ProviderId.safeParse(draft.provider);
  return {
    ...draft,
    ...defaultChoice(provider.success ? provider.data : "claude-code", role),
    role,
    effort,
    name: draft.name === "" ? name : draft.name,
  };
};

export function PresetCards({
  show,
  bossTaken,
  draft,
  patch,
}: {
  show: boolean;
  bossTaken: boolean;
  draft: AgentDraft;
  patch: (next: Partial<AgentDraft>) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!show) {
    return null;
  }
  return (
    <div className="mb-14">
      <div className="text-11h text-ink-label mb-8">{t("agent.presetLead")}</div>
      <div className="grid grid-cols-2 gap-8">
        {PRESET_IDS.filter((id) => !(bossTaken && SHAPE[id].role === "boss")).map((id) => (
          <button
            key={id}
            type="button"
            className={CARD}
            onClick={() => {
              patch(presetDraft(id, draft, t(`agent.presetName_${id}`)));
            }}
          >
            <span className="text-ink-label mt-1 flex-[0_0_auto]">
              {ROLE_MARKS[SHAPE[id].role]}
            </span>
            <span>
              <span className="block text-12h text-ink-bright">{t(`agent.preset_${id}`)}</span>
              <span className="block text-11h text-ink-label mt-2">
                {t(`agent.presetDesc_${id}`)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
