import { defaultChoice } from "@ho/core";
import { type AgentRole, type EffortLevel, PROVIDERS, ProviderId } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { ROLE_MARKS } from "./agent-roles.tsx";
import { SelectField } from "./select-field.tsx";
import type { AgentDraft } from "./store.ts";

const PRESET_IDS = [
  "triage",
  "worker",
  "architect",
  "bugfixer",
  "refactor",
  "tester",
  "quick",
  "docs",
  "deps",
  "reviewer",
  "security",
  "clerk",
] as const;
type PresetId = (typeof PRESET_IDS)[number];

type Shape = { role: AgentRole; effort?: EffortLevel; model?: string };

const SHAPE: Record<PresetId, Shape> = {
  triage: { role: "boss" },
  worker: { role: "worker" },
  architect: { role: "worker", effort: "max" },
  bugfixer: { role: "worker" },
  refactor: { role: "worker" },
  tester: { role: "worker" },
  quick: { role: "worker", effort: "low", model: "haiku" },
  docs: { role: "worker", effort: "low", model: "haiku" },
  deps: { role: "worker", effort: "low", model: "haiku" },
  reviewer: { role: "reviewer" },
  security: { role: "reviewer", effort: "max" },
  clerk: { role: "clerk" },
};

const presetDraft = (id: PresetId, draft: AgentDraft, name: string, prompt: string): AgentDraft => {
  const { role, effort, model } = SHAPE[id];
  const parsed = ProviderId.safeParse(draft.provider);
  const provider = parsed.success ? parsed.data : "claude-code";
  const capabilities = PROVIDERS[provider];
  const base = defaultChoice(provider, role);
  const wantedModel =
    model !== undefined &&
    (capabilities.freeFormModels || capabilities.models.some((m) => m.id === model))
      ? model
      : base.model;
  return {
    ...draft,
    ...base,
    role,
    model: wantedModel,
    effort:
      effort !== undefined && capabilities.effortLevels.includes(effort) ? effort : base.effort,
    name: draft.name === "" ? name : draft.name,
    prompt: prompt !== "" && draft.prompt === "" ? prompt : draft.prompt,
  };
};

const matching = (draft: AgentDraft): PresetId =>
  PRESET_IDS.find((id) => SHAPE[id].role === draft.role && SHAPE[id].effort === draft.effort) ??
  PRESET_IDS.find((id) => SHAPE[id].role === draft.role) ??
  "worker";

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
  const idOf = (label: string): PresetId | undefined =>
    offered.find((one) => labelOf(one) === label);
  return (
    <div className="mb-14">
      <SelectField
        label={t("agent.presetLead")}
        options={offered.map((id) => labelOf(id))}
        value={labelOf(matching(draft))}
        markOf={(option) => {
          const id = idOf(option);
          return id === undefined ? null : ROLE_MARKS[SHAPE[id].role];
        }}
        onPick={(next) => {
          const id = idOf(next);
          if (id !== undefined) {
            patch(
              presetDraft(id, draft, t(`agent.presetName_${id}`), t(`agent.presetPrompt_${id}`)),
            );
          }
        }}
      />
    </div>
  );
}
