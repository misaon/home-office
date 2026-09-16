import { defaultChoice } from "@ho/core";
import { type AgentRole, type EffortLevel, ProviderId } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { ROLE_MARKS } from "./agent-roles.tsx";
import { SelectField } from "./select-field.tsx";
import type { AgentDraft } from "./store.ts";

const PRESET_IDS = ["triage", "builder", "quick", "reviewer"] as const;
type PresetId = (typeof PRESET_IDS)[number];

const SHAPE: Record<PresetId, { role: AgentRole; effort: EffortLevel }> = {
  triage: { role: "boss", effort: "medium" },
  builder: { role: "worker", effort: "medium" },
  quick: { role: "worker", effort: "low" },
  reviewer: { role: "reviewer", effort: "medium" },
};

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

const matching = (draft: AgentDraft): PresetId =>
  PRESET_IDS.find((id) => SHAPE[id].role === draft.role && SHAPE[id].effort === draft.effort) ??
  PRESET_IDS.find((id) => SHAPE[id].role === draft.role) ??
  "builder";

export function PresetSelect({
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
  const offered = PRESET_IDS.filter((id) => !(bossTaken && SHAPE[id].role === "boss"));
  const labelOf = (id: PresetId): string => t(`agent.preset_${id}`);
  const options = offered.map((id) => labelOf(id));
  return (
    <div className="mb-14">
      <SelectField
        label={t("agent.presetLead")}
        options={options}
        value={labelOf(matching(draft))}
        markOf={(option) => {
          const id = offered.find((one) => labelOf(one) === option);
          return id === undefined ? null : ROLE_MARKS[SHAPE[id].role];
        }}
        onPick={(next) => {
          const id = offered.find((one) => labelOf(one) === next);
          if (id !== undefined) {
            patch(presetDraft(id, draft, t(`agent.presetName_${id}`)));
          }
        }}
      />
    </div>
  );
}
