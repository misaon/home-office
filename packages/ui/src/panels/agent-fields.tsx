import { defaultChoice } from "@ho/core";
import {
  type AgentRole,
  type AuthKind,
  type EffortLevel,
  PROVIDERS,
  ProviderId,
} from "@ho/protocol";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Field } from "../kit/controls.tsx";
import { Select } from "../kit/select.tsx";
import { Input } from "@/components/ui/input";

export type Choice = { provider: ProviderId; auth: AuthKind; model: string; effort: EffortLevel };

const CUSTOM = "__custom__";

/** A list of plain values as the select wants them: the value is its own label. */
const plain = <T extends string>(values: readonly T[]): { value: T; label: T }[] =>
  values.map((value) => ({ value, label: value }));

type Props = {
  value: Choice;
  onChange: (next: Choice) => void;
  /** The role the defaults of a provider switch should follow. */
  role: AgentRole;
};

/**
 * Provider, auth, model and effort pickers driven by the provider catalog: only valid combinations are
 * offered, a provider switch resets model/auth/effort to that provider's defaults, and providers that accept
 * any model id get a free-text field behind "{t("common.custom")}".
 */
export function ProviderModelFields({ value, onChange, role }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const id = useId();
  const catalog = PROVIDERS[value.provider];
  const listed = catalog.models.some((m) => m.id === value.model);
  const [custom, setCustom] = useState(!listed && catalog.freeFormModels);
  const models = catalog.models.map((m) => ({ value: m.id, label: m.label }));
  return (
    <>
      <Field id={`${id}-provider`} label={t("agent.provider")}>
        <Select
          id={`${id}-provider`}
          value={value.provider}
          options={ProviderId.options.map((provider) => ({
            value: provider,
            label: PROVIDERS[provider].name,
          }))}
          onChange={(provider) => {
            setCustom(false);
            onChange({ provider, ...defaultChoice(provider, role) });
          }}
        />
      </Field>
      {catalog.authKinds.length > 1 ? (
        <Field id={`${id}-auth`} label={t("agent.auth")}>
          <Select
            id={`${id}-auth`}
            value={value.auth}
            options={plain(catalog.authKinds)}
            onChange={(auth) => {
              onChange({ ...value, auth });
            }}
          />
        </Field>
      ) : null}
      <Field id={`${id}-model`} label={t("agent.model")}>
        {custom ? (
          <Input
            id={`${id}-model`}
            className="font-mono"
            placeholder={catalog.defaultModel}
            defaultValue={value.model}
            onBlur={(e) => {
              const model = e.target.value.trim();
              if (model !== "" && model !== value.model) {
                onChange({ ...value, model });
              }
            }}
          />
        ) : (
          <Select
            id={`${id}-model`}
            value={listed ? value.model : CUSTOM}
            options={
              catalog.freeFormModels
                ? [...models, { value: CUSTOM, label: t("common.custom") }]
                : models
            }
            onChange={(model) => {
              if (model === CUSTOM) {
                setCustom(true);
              } else {
                onChange({ ...value, model });
              }
            }}
          />
        )}
      </Field>
      {catalog.effortLevels.length > 0 ? (
        <Field id={`${id}-effort`} label={t("agent.effort")}>
          <Select
            id={`${id}-effort`}
            value={value.effort}
            options={plain(catalog.effortLevels)}
            onChange={(effort) => {
              onChange({ ...value, effort });
            }}
          />
        </Field>
      ) : null}
    </>
  );
}
