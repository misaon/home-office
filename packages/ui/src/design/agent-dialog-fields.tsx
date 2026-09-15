import { defaultChoice } from "@ho/core";
import { AuthKind, EffortLevel, Gender, PROVIDERS, ProviderId } from "@ho/protocol";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CAP, INPUT } from "./dialog-sheet.tsx";
import { GENDER_KEY } from "../i18n/labels.ts";
import { SelectField } from "./select-field.tsx";
import type { AgentDraft } from "./store.ts";

const GRID = "grid grid-cols-2 gap-12 mb-18";

/** A provider's own models, plus the door out of the list when it takes any id at all. */
const modelOptions = (provider: ProviderId, t: (key: "common.custom") => string): string[] => {
  const catalogue = PROVIDERS[provider];
  const labels = catalogue.models.map((m) => m.label);
  return catalogue.freeFormModels ? [...labels, t("common.custom")] : labels;
};

const labelOfModel = (provider: ProviderId, id: string): string =>
  PROVIDERS[provider].models.find((m) => m.id === id)?.label ?? id;

/** A name, and the choices the chosen provider actually offers. */
export function AgentDialogFields({
  draft,
  patch,
}: {
  draft: AgentDraft;
  patch: (next: Partial<AgentDraft>) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const provider = ProviderId.parse(draft.provider);
  const catalogue = PROVIDERS[provider];
  const [custom, setCustom] = useState(() => !catalogue.models.some((m) => m.id === draft.model));
  const options = modelOptions(provider, t);

  const pickProvider = (next: string): void => {
    const id = ProviderId.parse(next);
    const chosen = defaultChoice(id, draft.role);
    setCustom(false);
    patch({ provider: id, model: chosen.model, auth: chosen.auth, effort: chosen.effort });
  };
  const pickModel = (next: string): void => {
    if (next === t("common.custom")) {
      setCustom(true);
      return;
    }
    setCustom(false);
    const found = catalogue.models.find((m) => m.label === next);
    patch({ model: found?.id ?? next });
  };

  return (
    <div className={GRID}>
      <div>
        <div className={`${CAP} text-9h mb-8`}>{t("agent.name")}</div>
        <input
          value={draft.name}
          onChange={(e) => {
            patch({ name: e.target.value });
          }}
          placeholder={t("agent.namePlaceholder")}
          className={`${INPUT} placeholder:text-ink-ghost`}
        />
      </div>
      <SelectField
        scope="dlg"
        name="provider"
        label={t("agent.provider")}
        options={ProviderId.options.map((id) => PROVIDERS[id].name)}
        value={catalogue.name}
        onPick={(next) => {
          pickProvider(ProviderId.options.find((id) => PROVIDERS[id].name === next) ?? next);
        }}
      />
      {custom ? (
        <div>
          <div className={`${CAP} text-9h mb-8`}>{t("agent.model")}</div>
          <input
            value={draft.model}
            onChange={(e) => {
              patch({ model: e.target.value });
            }}
            className={INPUT}
          />
        </div>
      ) : (
        <SelectField
          scope="dlg"
          name="model"
          label={t("agent.model")}
          options={options}
          value={labelOfModel(provider, draft.model)}
          onPick={pickModel}
        />
      )}
      {catalogue.effortLevels.length === 0 ? (
        <div>
          <div className={`${CAP} text-9h mb-8`}>{t("agent.effort")}</div>
          <div className={`${INPUT} text-ink-ghost`}>{t("agent.noEffort")}</div>
        </div>
      ) : (
        <SelectField
          scope="dlg"
          name="effort"
          label={t("agent.effort")}
          options={catalogue.effortLevels}
          value={EffortLevel.parse(draft.effort)}
          onPick={(next) => {
            patch({ effort: next });
          }}
        />
      )}
      <SelectField
        scope="dlg"
        name="auth"
        label={t("agent.auth")}
        options={catalogue.authKinds}
        value={draft.auth}
        onPick={(next) => {
          patch({ auth: AuthKind.parse(next) });
        }}
      />
      <SelectField
        scope="dlg"
        name="gender"
        label={t("agent.gender")}
        options={Gender.options.map((g) => t(GENDER_KEY[g]))}
        value={t(GENDER_KEY[draft.gender])}
        onPick={(next) => {
          const picked = Gender.options.find((g) => t(GENDER_KEY[g]) === next);
          if (picked !== undefined) {
            patch({ gender: picked });
          }
        }}
      />
    </div>
  );
}

/** How they work, not what they work on. */
export function AgentPrompt({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex items-center gap-8 mb-8">
        <span className={`${CAP} text-9h`}>{t("agent.basePromptCaption")}</span>
        <span className="flex-1" />
        <span className="text-11 text-ink-meta">{t("agent.basePromptHint")}</span>
      </div>
      <textarea
        rows={6}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        placeholder={t("agent.promptPlaceholder")}
        className={`${INPUT} resize-none leading-text placeholder:text-ink-ghost`}
      />
    </>
  );
}
