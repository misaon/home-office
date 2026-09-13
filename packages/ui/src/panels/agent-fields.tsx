import { defaultChoice } from "@ho/core";
import { type AgentRole, AuthKind, EffortLevel, PROVIDERS, ProviderId } from "@ho/protocol";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CONTROL, Field } from "../kit/controls.tsx";

export type Choice = { provider: ProviderId; auth: AuthKind; model: string; effort: EffortLevel };

const CUSTOM = "__custom__";

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
  const switchProvider = (provider: ProviderId): void => {
    setCustom(false);
    onChange({ provider, ...defaultChoice(provider, role) });
  };
  return (
    <>
      <Field id={`${id}-provider`} label={t("agent.provider")}>
        <select
          id={`${id}-provider`}
          className={CONTROL}
          value={value.provider}
          onChange={(e) => {
            switchProvider(ProviderId.parse(e.target.value));
          }}
        >
          {ProviderId.options.map((provider) => (
            <option key={provider} value={provider}>
              {PROVIDERS[provider].name}
            </option>
          ))}
        </select>
      </Field>
      {catalog.authKinds.length > 1 ? (
        <Field id={`${id}-auth`} label={t("agent.auth")}>
          <select
            id={`${id}-auth`}
            className={CONTROL}
            value={value.auth}
            onChange={(e) => {
              onChange({ ...value, auth: AuthKind.parse(e.target.value) });
            }}
          >
            {catalog.authKinds.map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field id={`${id}-model`} label={t("agent.model")}>
        {custom ? (
          <input
            id={`${id}-model`}
            className={`${CONTROL} font-mono`}
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
          <select
            id={`${id}-model`}
            className={CONTROL}
            value={listed ? value.model : CUSTOM}
            onChange={(e) => {
              if (e.target.value === CUSTOM) {
                setCustom(true);
              } else {
                onChange({ ...value, model: e.target.value });
              }
            }}
          >
            {catalog.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            {catalog.freeFormModels ? <option value={CUSTOM}>{t("common.custom")}</option> : null}
          </select>
        )}
      </Field>
      {catalog.effortLevels.length > 0 ? (
        <Field id={`${id}-effort`} label={t("agent.effort")}>
          <select
            id={`${id}-effort`}
            className={CONTROL}
            value={value.effort}
            onChange={(e) => {
              onChange({ ...value, effort: EffortLevel.parse(e.target.value) });
            }}
          >
            {catalog.effortLevels.map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </Field>
      ) : null}
    </>
  );
}
