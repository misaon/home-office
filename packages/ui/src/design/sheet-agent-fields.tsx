import { AgentRole, EffortLevel, ProviderId } from "@ho/protocol";
import { useTranslation } from "react-i18next";
import type { Member } from "./data.ts";
import { SelectField } from "./select-field.tsx";
import { CAPS, FIELD } from "./sheet-shell.tsx";

/** What can be changed about a colleague, in the grid the design draws. */
export function AgentFields({
  draft,
  patch,
}: {
  draft: Member;
  patch: (next: Partial<Member>) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "11px", marginBottom: "14px" }}
    >
      <SelectField
        scope="sheet"
        name={t("agent.role")}
        options={AgentRole.options}
        value={draft.role}
        onPick={(next) => {
          patch({ role: AgentRole.parse(next) });
        }}
      />
      <SelectField
        scope="sheet"
        name={t("agent.provider")}
        options={ProviderId.options}
        value={draft.provider}
        onPick={(next) => {
          patch({ provider: next });
        }}
      />
      <SelectField
        scope="sheet"
        name={t("agent.effort")}
        options={EffortLevel.options}
        value={draft.effort}
        onPick={(next) => {
          patch({ effort: next });
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ ...CAPS, marginBottom: "7px" }}>{t("agent.model")}</div>
        <input
          value={draft.model}
          onChange={(e) => {
            patch({ model: e.target.value });
          }}
          style={{ ...FIELD, padding: "9px 11px", fontSize: "12.5px" }}
        />
      </div>
    </div>
  );
}
