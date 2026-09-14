import { AgentRole, AuthKind, EffortLevel, Gender, ProviderId } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import { GENDER_KEY } from "../i18n/labels.ts";
import { SelectField } from "./select-field.tsx";
import { CAPTION } from "./tokens.ts";
import type { Draft } from "./team-new.tsx";

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: "10px",
  border: "1px solid #2C2C32",
  background: "#0A0A0C",
  fontSize: "12.5px",
};

/** The six choices that make a colleague. */
export function HireFields({
  draft,
  patch,
}: {
  draft: Draft;
  patch: (next: Partial<Draft>) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "11px" }}>
      <SelectField
        scope="new"
        name={t("agent.role")}
        options={AgentRole.options}
        value={draft.role}
        onPick={(next) => {
          patch({ role: AgentRole.parse(next) });
        }}
      />
      <SelectField
        scope="new"
        name={t("agent.gender")}
        options={Gender.options.map((g) => t(GENDER_KEY[g]))}
        value={t(GENDER_KEY[draft.gender])}
        onPick={(next) => {
          const picked = Gender.options.find((g) => t(GENDER_KEY[g]) === next);
          if (picked !== undefined) {
            patch({ gender: picked });
          }
        }}
      />
      <SelectField
        scope="new"
        name={t("agent.provider")}
        options={ProviderId.options}
        value={draft.provider}
        onPick={(next) => {
          patch({ provider: ProviderId.parse(next) });
        }}
      />
      <SelectField
        scope="new"
        name={t("agent.auth")}
        options={AuthKind.options}
        value={draft.auth}
        onPick={(next) => {
          patch({ auth: AuthKind.parse(next) });
        }}
      />
      <SelectField
        scope="new"
        name={t("agent.effort")}
        options={EffortLevel.options}
        value={draft.effort}
        onPick={(next) => {
          patch({ effort: EffortLevel.parse(next) });
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ ...CAPTION, marginBottom: "7px" }}>{t("agent.model")}</div>
        <input
          value={draft.model}
          onChange={(e) => {
            patch({ model: e.target.value });
          }}
          style={{ ...INPUT, padding: "9px 11px", fontSize: "12.5px" }}
        />
      </div>
    </div>
  );
}
