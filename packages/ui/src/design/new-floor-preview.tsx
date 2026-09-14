import { useTranslation } from "react-i18next";
import { CAP, INPUT } from "./dialog-sheet.tsx";
import type { Found, RepoDraft } from "./add-project-inspect.ts";
import { SelectField } from "./select-field.tsx";
import { MONO } from "./tokens.ts";

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "11px",
  marginTop: "18px",
  padding: "13px 14px",
  borderRadius: "13px",
  transition: "all .28s",
};

const BADGE: React.CSSProperties = {
  width: "26px",
  height: "26px",
  flex: "0 0 26px",
  borderRadius: "8px",
  display: "grid",
  placeItems: "center",
  ...MONO,
  fontSize: "11px",
};

const ELLIPSIS: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** The floor's own name and the branch work starts from. */
export function FloorDetails({
  draft,
  setDraft,
  inspection,
}: {
  draft: RepoDraft;
  setDraft: (draft: RepoDraft) => void;
  inspection: Found | null;
}): React.JSX.Element {
  const { t } = useTranslation();
  const branches = inspection?.branches ?? [];
  const branch = draft.branch === "" ? (inspection?.defaultBranch ?? "") : draft.branch;
  const options = branch === "" || branches.includes(branch) ? branches : [branch, ...branches];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 150px",
        gap: "12px",
        marginTop: "16px",
      }}
    >
      <div>
        <div style={{ ...CAP, marginBottom: "8px" }}>{t("project.nameCap")}</div>
        <input
          value={draft.name}
          placeholder={inspection?.name ?? t("project.nameHint")}
          onChange={(e) => {
            setDraft({ ...draft, name: e.target.value });
          }}
          style={INPUT}
        />
      </div>
      <SelectField
        scope="nf"
        name="branch"
        label={t("project.branchCap")}
        mono
        muted={branch === ""}
        options={options.length === 0 ? ["—"] : options}
        value={branch === "" ? "—" : branch}
        onPick={(next) => {
          setDraft({ ...draft, branch: next });
        }}
      />
    </div>
  );
}

/** What pressing Create would actually make, said before it is made. */
export function FloorPreview({
  number,
  name,
  meta,
}: {
  number: number;
  name: string | null;
  meta: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const named = name !== null;
  return (
    <div
      style={{
        ...ROW,
        border: `1px solid ${named ? "rgba(255,197,49,.28)" : "#26262C"}`,
        background: named ? "rgba(255,197,49,.05)" : "#0E0E11",
      }}
    >
      <span
        style={{
          ...BADGE,
          background: named ? "var(--a,#FFC531)" : "#1D1D22",
          color: named ? "#150F02" : "#8A8780",
        }}
      >
        <span>{number}</span>
      </span>
      <div style={{ flex: "1", minWidth: "0" }}>
        <div
          style={{ ...MONO, fontSize: "12px", color: named ? "#FFD666" : "#8A8780", ...ELLIPSIS }}
        >
          {name ?? t("project.previewUnnamed")}
        </div>
        <div style={{ fontSize: "11px", color: "#A6A39C", marginTop: "4px", ...ELLIPSIS }}>
          {meta}
        </div>
      </div>
    </div>
  );
}
