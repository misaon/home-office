import { defaultChoice } from "@ho/core";
import { type AgentRole, AuthKind, EffortLevel, PROVIDERS, ProviderId } from "@ho/protocol";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export type Choice = { provider: ProviderId; auth: AuthKind; model: string; effort: EffortLevel };

const CUSTOM = "__custom__";

type Props = {
  value: Choice;
  onChange: (next: Choice) => void;
  /** The role the defaults of a provider switch should follow. */
  role: AgentRole;
  /** Compact rows inside an existing agent card versus the wider "new agent" form. */
  dense?: boolean;
};

/**
 * Provider, auth, model and effort pickers driven by the provider catalog: only valid combinations are
 * offered, a provider switch resets model/auth/effort to that provider's defaults, and providers that accept
 * any model id get a free-text field behind "{t("common.custom")}".
 */
export function ProviderModelFields({
  value,
  onChange,
  role,
  dense = false,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const catalog = PROVIDERS[value.provider];
  const listed = catalog.models.some((m) => m.id === value.model);
  const [custom, setCustom] = useState(!listed && catalog.freeFormModels);
  const control = "rounded-md border border-line bg-ink";
  const input = dense ? `${control} px-2 py-1` : `${control} px-2 py-1.5`;
  const switchProvider = (provider: ProviderId): void => {
    setCustom(false);
    onChange({ provider, ...defaultChoice(provider, role) });
  };
  return (
    <>
      <label className="flex items-center gap-2">
        {dense ? "provider" : null}
        <select
          className={input}
          value={value.provider}
          onChange={(e) => {
            switchProvider(ProviderId.parse(e.target.value));
          }}
        >
          {ProviderId.options.map((id) => (
            <option key={id} value={id}>
              {PROVIDERS[id].name}
            </option>
          ))}
        </select>
      </label>
      {catalog.authKinds.length > 1 ? (
        <label className="flex items-center gap-2">
          {dense ? "auth" : null}
          <select
            className={input}
            value={value.auth}
            onChange={(e) => {
              onChange({ ...value, auth: AuthKind.parse(e.target.value) });
            }}
          >
            {catalog.authKinds.map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex items-center gap-2">
        {dense ? "model" : null}
        {custom ? (
          <input
            className={`${input} w-full font-mono`}
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
            className={input}
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
      </label>
      {catalog.effortLevels.length > 0 ? (
        <label className="flex items-center gap-2">
          {dense ? "effort" : null}
          <select
            className={input}
            value={value.effort}
            onChange={(e) => {
              onChange({ ...value, effort: EffortLevel.parse(e.target.value) });
            }}
          >
            {catalog.effortLevels.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}
